<?php
/**
 * WP-CLI commands.
 *
 * @package HtmlToElementor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Convert HTML pages into native Elementor pages and templates.
 *
 * ## EXAMPLES
 *
 *     # Create a draft Elementor page from an HTML file (needs Node.js 18+ on the server)
 *     $ wp html-to-elementor import landing.html --user=admin
 *
 *     # Import a template converted elsewhere (no Node.js needed)
 *     $ wp html-to-elementor import landing.json --as=template --user=admin
 *
 *     # Check that Elementor, containers and Node.js are ready
 *     $ wp html-to-elementor doctor
 */
class HTE_CLI {

	/**
	 * Import an .html file or a converted .json template as an Elementor page or template.
	 *
	 * ## OPTIONS
	 *
	 * <file>
	 * : Path to an .html file (converted with Node.js) or a .json file (Elementor template export
	 * or a plain elements array).
	 *
	 * [--title=<title>]
	 * : Title. Defaults to the page <title> or the template title.
	 *
	 * [--as=<as>]
	 * : What to create.
	 * ---
	 * default: page
	 * options:
	 *   - page
	 *   - template
	 *   - section
	 * ---
	 *
	 * [--status=<status>]
	 * : Post status for pages.
	 * ---
	 * default: draft
	 * options:
	 *   - draft
	 *   - publish
	 *   - private
	 *   - pending
	 * ---
	 *
	 * [--post=<id>]
	 * : Replace the Elementor content of this existing page instead of creating a new one.
	 *
	 * [--sideload-images]
	 * : Copy remote images into the Media Library and use the local copies.
	 *
	 * [--base-url=<url>]
	 * : Prefix for relative image and link URLs in the HTML.
	 *
	 * [--css=<file>]
	 * : Extra stylesheet to apply when converting HTML. Repeat for several.
	 *
	 * [--keep-css]
	 * : Also embed the original CSS in an HTML widget and keep class names.
	 *
	 * [--no-canvas]
	 * : Keep the theme header and footer instead of the Elementor Canvas template.
	 *
	 * [--porcelain]
	 * : Output only the new post ID.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp html-to-elementor import landing.html --status=publish --sideload-images --user=admin
	 *     Success: Created page 42 (12 containers, 27 widgets).
	 *
	 * @param array $args       Positional arguments.
	 * @param array $assoc_args Associative arguments.
	 */
	public function import( $args, $assoc_args ) {
		list( $file ) = $args;
		if ( ! is_readable( $file ) ) {
			WP_CLI::error( "Cannot read {$file}." );
		}
		$this->ensure_user();

		$ext    = strtolower( pathinfo( $file, PATHINFO_EXTENSION ) );
		$report = null;
		if ( in_array( $ext, array( 'html', 'htm' ), true ) ) {
			$converted = HTE_Node::convert(
				$file,
				array(
					'title'    => WP_CLI\Utils\get_flag_value( $assoc_args, 'title', '' ),
					'base_url' => WP_CLI\Utils\get_flag_value( $assoc_args, 'base-url', '' ),
					'keep_css' => WP_CLI\Utils\get_flag_value( $assoc_args, 'keep-css', false ),
					'canvas'   => ! WP_CLI\Utils\get_flag_value( $assoc_args, 'no-canvas', false ),
					'css'      => (array) WP_CLI\Utils\get_flag_value( $assoc_args, 'css', array() ),
				)
			);
			if ( is_wp_error( $converted ) ) {
				WP_CLI::error( $converted );
			}
			$data   = $converted['template'];
			$report = $converted['report'];
		} else {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local CLI file.
			$data = json_decode( (string) file_get_contents( $file ), true );
			if ( ! is_array( $data ) ) {
				WP_CLI::error( "{$file} is not valid JSON." );
			}
		}

		$result = HTE_Importer::import(
			$data,
			array(
				'title'           => WP_CLI\Utils\get_flag_value( $assoc_args, 'title', '' ),
				'as'              => WP_CLI\Utils\get_flag_value( $assoc_args, 'as', 'page' ),
				'status'          => WP_CLI\Utils\get_flag_value( $assoc_args, 'status', 'draft' ),
				'post_id'         => (int) WP_CLI\Utils\get_flag_value( $assoc_args, 'post', 0 ),
				'sideload_images' => (bool) WP_CLI\Utils\get_flag_value( $assoc_args, 'sideload-images', false ),
				'check_caps'      => false,
			)
		);
		if ( is_wp_error( $result ) ) {
			WP_CLI::error( $result );
		}

		if ( WP_CLI\Utils\get_flag_value( $assoc_args, 'porcelain', false ) ) {
			WP_CLI::line( (string) $result['id'] );
			return;
		}
		if ( $report ) {
			foreach ( (array) $report['warnings'] as $warning ) {
				WP_CLI::warning( $warning );
			}
			if ( ! empty( $report['htmlFallbacks'] ) ) {
				WP_CLI::log( 'Kept as HTML widgets: ' . implode( ', ', $report['htmlFallbacks'] ) );
			}
		}
		$what = WP_CLI\Utils\get_flag_value( $assoc_args, 'post', 0 ) ? 'Updated' : 'Created';
		$kind = WP_CLI\Utils\get_flag_value( $assoc_args, 'as', 'page' );
		$sum  = $report ? sprintf( ' (%d containers, %d widgets)', $report['containers'], array_sum( (array) $report['widgets'] ) ) : '';
		WP_CLI::log( 'Edit: ' . $result['edit_url'] );
		if ( $result['sideloaded'] ) {
			WP_CLI::log( "Copied {$result['sideloaded']} images into the Media Library." );
		}
		WP_CLI::success( "{$what} {$kind} {$result['id']}{$sum}." );
	}

	/**
	 * Convert an .html file to an Elementor template (.json) without importing it.
	 *
	 * ## OPTIONS
	 *
	 * <file>
	 * : Path to the .html file.
	 *
	 * [--out=<dir>]
	 * : Output folder. Defaults to the file's folder.
	 *
	 * [--base-url=<url>]
	 * : Prefix for relative image and link URLs.
	 *
	 * @param array $args       Positional arguments.
	 * @param array $assoc_args Associative arguments.
	 */
	public function convert( $args, $assoc_args ) {
		list( $file ) = $args;
		$converted    = HTE_Node::convert( $file, array( 'base_url' => WP_CLI\Utils\get_flag_value( $assoc_args, 'base-url', '' ) ) );
		if ( is_wp_error( $converted ) ) {
			WP_CLI::error( $converted );
		}
		$dir  = rtrim( WP_CLI\Utils\get_flag_value( $assoc_args, 'out', dirname( $file ) ), '/\\' );
		$slug = sanitize_title( $converted['template']['title'] );
		$path = $dir . DIRECTORY_SEPARATOR . ( $slug ? $slug : 'page' ) . '.json';
		if ( ! wp_mkdir_p( $dir ) ) {
			WP_CLI::error( "Cannot create {$dir}." );
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- local CLI file.
		file_put_contents( $path, wp_json_encode( $converted['template'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
		foreach ( (array) $converted['report']['warnings'] as $warning ) {
			WP_CLI::warning( $warning );
		}
		WP_CLI::success( "Wrote {$path}" );
	}

	/**
	 * Check that Elementor, flexbox containers and Node.js are ready.
	 *
	 * @param array $args       Positional arguments.
	 * @param array $assoc_args Associative arguments.
	 */
	public function doctor( $args, $assoc_args ) {
		$failed = false;
		foreach ( HTE_Importer::doctor() as $name => $check ) {
			$line = str_pad( $name, 12 ) . $check['message'];
			if ( $check['ok'] ) {
				WP_CLI::log( "OK    {$line}" );
			} else {
				WP_CLI::log( "WARN  {$line}" );
				$failed = $failed || 'node' !== $name;
			}
		}
		if ( $failed ) {
			WP_CLI::error( 'Not ready to import.' );
		}
		WP_CLI::success( 'Ready.' );
	}

	/**
	 * Elementor only saves documents for a user who can edit them; WP-CLI has no user unless --user is passed.
	 */
	private function ensure_user() {
		if ( get_current_user_id() ) {
			return;
		}
		$admins = get_users(
			array(
				'role'    => 'administrator',
				'number'  => 1,
				'orderby' => 'ID',
				'fields'  => 'ID',
			)
		);
		if ( ! $admins ) {
			WP_CLI::error( 'No administrator found. Pass --user=<login>.' );
		}
		wp_set_current_user( (int) $admins[0] );
		WP_CLI::log( 'No --user given; acting as administrator #' . (int) $admins[0] . '.' );
	}
}
