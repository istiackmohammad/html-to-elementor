<?php
/**
 * Creates Elementor pages and templates from converted element data.
 *
 * @package HtmlToElementor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Validates element data and saves it through Elementor's Documents API.
 */
class HTE_Importer {

	const MAX_DEPTH    = 40;
	const MAX_ELEMENTS = 5000;

	/**
	 * Import converted data as a page or a template.
	 *
	 * @param array $data Either an Elementor template export ({content, page_settings, title, type})
	 *                    or a plain elements array (the _elementor_data value).
	 * @param array $args {
	 *     @type string $title           Title. Defaults to the template title.
	 *     @type string $as              'page' (default), 'template' or 'section'.
	 *     @type string $status          Post status for pages: draft (default), publish, private, pending.
	 *     @type int    $post_id         Replace the Elementor content of this existing page instead.
	 *     @type bool   $sideload_images Copy remote images into the Media Library.
	 *     @type bool   $check_caps      Enforce the current user's capabilities (false for WP-CLI).
	 * }
	 * @return array|WP_Error { id, edit_url, view_url, sideloaded } on success.
	 */
	public static function import( array $data, array $args = array() ) {
		$args = wp_parse_args(
			$args,
			array(
				'title'           => '',
				'as'              => 'page',
				'status'          => 'draft',
				'post_id'         => 0,
				'sideload_images' => false,
				'check_caps'      => true,
			)
		);

		if ( ! did_action( 'elementor/loaded' ) || ! class_exists( '\Elementor\Plugin' ) ) {
			return new WP_Error( 'hte_no_elementor', __( 'Elementor is not active.', 'html-to-elementor' ) );
		}

		$is_template   = isset( $data['content'] ) && is_array( $data['content'] );
		$elements      = $is_template ? $data['content'] : $data;
		$page_settings = ( $is_template && isset( $data['page_settings'] ) && is_array( $data['page_settings'] ) ) ? $data['page_settings'] : array();
		$title         = '' !== $args['title'] ? $args['title'] : ( $is_template && ! empty( $data['title'] ) ? (string) $data['title'] : __( 'Converted page', 'html-to-elementor' ) );

		$valid = self::validate( $elements );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}

		$as = in_array( $args['as'], array( 'page', 'template', 'section' ), true ) ? $args['as'] : 'page';

		if ( $args['check_caps'] ) {
			$cap = 'page' === $as ? 'edit_pages' : 'edit_posts';
			if ( ! current_user_can( $cap ) ) {
				return new WP_Error( 'hte_forbidden', __( 'You are not allowed to create this content.', 'html-to-elementor' ), array( 'status' => 403 ) );
			}
			if ( self::has_html_widget( $elements ) && ! current_user_can( 'unfiltered_html' ) ) {
				return new WP_Error(
					'hte_unfiltered_html',
					__( 'This page contains HTML widgets, which only users allowed to post unfiltered HTML (administrators) may import.', 'html-to-elementor' ),
					array( 'status' => 403 )
				);
			}
		}

		$sideloaded = 0;
		$plugin     = \Elementor\Plugin::$instance;

		if ( $args['post_id'] ) {
			$post_id = absint( $args['post_id'] );
			if ( $args['check_caps'] && ! current_user_can( 'edit_post', $post_id ) ) {
				return new WP_Error( 'hte_forbidden', __( 'You are not allowed to edit that page.', 'html-to-elementor' ), array( 'status' => 403 ) );
			}
			$document = $plugin->documents->get( $post_id, false );
			if ( ! $document ) {
				return new WP_Error( 'hte_not_found', __( 'That post does not exist or cannot be edited with Elementor.', 'html-to-elementor' ), array( 'status' => 404 ) );
			}
		} else {
			$status = in_array( $args['status'], array( 'draft', 'publish', 'private', 'pending' ), true ) ? $args['status'] : 'draft';
			if ( 'page' === $as ) {
				$document = $plugin->documents->create(
					'wp-page',
					array(
						'post_title'  => $title,
						'post_status' => $status,
						'post_type'   => 'page',
					)
				);
			} else {
				$document = $plugin->documents->create(
					'template' === $as ? 'page' : 'section',
					array(
						'post_title'  => $title,
						'post_status' => 'publish',
					)
				);
			}
			if ( is_wp_error( $document ) ) {
				return $document;
			}
			if ( ! $document ) {
				return new WP_Error( 'hte_create_failed', __( 'Elementor could not create the document.', 'html-to-elementor' ) );
			}
			$post_id = $document->get_main_id();
		}

		if ( $args['sideload_images'] ) {
			$sideloaded = self::sideload_images( $elements, $post_id );
		}

		$template = isset( $page_settings['template'] ) ? sanitize_key( $page_settings['template'] ) : '';
		unset( $page_settings['template'] );

		$saved = $document->save(
			array(
				'elements' => $elements,
				'settings' => $page_settings,
			)
		);
		if ( false === $saved ) {
			if ( ! $args['post_id'] ) {
				wp_delete_post( $post_id, true );
			}
			return new WP_Error(
				'hte_save_failed',
				__( 'Elementor refused to save: the current user cannot edit this document. With WP-CLI, pass --user=<admin>.', 'html-to-elementor' )
			);
		}

		if ( in_array( $template, array( 'elementor_canvas', 'elementor_header_footer', 'default' ), true ) ) {
			update_post_meta( $post_id, '_wp_page_template', $template );
		}
		update_post_meta( $post_id, '_hte_imported', HTE_VERSION );

		return array(
			'id'         => $post_id,
			'edit_url'   => add_query_arg(
				array(
					'post'   => $post_id,
					'action' => 'elementor',
				),
				admin_url( 'post.php' )
			),
			'view_url'   => get_permalink( $post_id ),
			'sideloaded' => $sideloaded,
		);
	}

	/**
	 * Structural validation: every node needs an id, a known elType, settings and children.
	 *
	 * @param mixed $elements Elements array.
	 * @return true|WP_Error
	 */
	public static function validate( $elements ) {
		if ( ! is_array( $elements ) || ! $elements || array_keys( $elements ) !== range( 0, count( $elements ) - 1 ) ) {
			return new WP_Error( 'hte_invalid', __( 'Expected a non-empty list of Elementor elements.', 'html-to-elementor' ), array( 'status' => 400 ) );
		}
		$count = 0;
		$stack = array( array( $elements, 0 ) );
		while ( $stack ) {
			list( $nodes, $depth ) = array_pop( $stack );
			if ( $depth > self::MAX_DEPTH ) {
				return new WP_Error( 'hte_invalid', __( 'The element tree is nested too deeply.', 'html-to-elementor' ), array( 'status' => 400 ) );
			}
			foreach ( $nodes as $node ) {
				if ( ++$count > self::MAX_ELEMENTS ) {
					return new WP_Error( 'hte_invalid', __( 'The page has too many elements.', 'html-to-elementor' ), array( 'status' => 400 ) );
				}
				if ( ! is_array( $node ) || empty( $node['id'] ) || ! is_string( $node['id'] )
					|| ! isset( $node['elType'] ) || ! in_array( $node['elType'], array( 'container', 'widget', 'section', 'column' ), true )
					|| ( 'widget' === $node['elType'] && ( empty( $node['widgetType'] ) || ! preg_match( '/^[a-z0-9_-]+$/i', $node['widgetType'] ) ) )
					|| ( isset( $node['settings'] ) && ! is_array( $node['settings'] ) )
					|| ( isset( $node['elements'] ) && ! is_array( $node['elements'] ) ) ) {
					return new WP_Error( 'hte_invalid', __( 'An element is missing its id, type or settings.', 'html-to-elementor' ), array( 'status' => 400 ) );
				}
				if ( ! empty( $node['elements'] ) ) {
					$stack[] = array( $node['elements'], $depth + 1 );
				}
			}
		}
		return true;
	}

	/**
	 * Whether any node is an HTML widget (raw markup).
	 *
	 * @param array $elements Elements array.
	 */
	public static function has_html_widget( array $elements ): bool {
		foreach ( $elements as $node ) {
			if ( isset( $node['widgetType'] ) && 'html' === $node['widgetType'] ) {
				return true;
			}
			if ( ! empty( $node['elements'] ) && self::has_html_widget( $node['elements'] ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Copy remote images into the Media Library and point the settings at them.
	 *
	 * @param array $elements Elements (modified in place).
	 * @param int   $post_id  Attach the media to this post.
	 * @return int Number of images copied.
	 */
	public static function sideload_images( array &$elements, int $post_id ): int {
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		$cache = array();
		$count = 0;
		$home  = wp_parse_url( home_url(), PHP_URL_HOST );

		$walk = static function ( array &$nodes ) use ( &$walk, &$cache, &$count, $post_id, $home ) {
			foreach ( $nodes as &$node ) {
				if ( ! empty( $node['settings'] ) && is_array( $node['settings'] ) ) {
					foreach ( $node['settings'] as $key => &$value ) {
						if ( ! is_array( $value ) || empty( $value['url'] ) || ! empty( $value['id'] )
							|| ! preg_match( '/(^image$|_image$)/', $key ) ) {
							continue;
						}
						$url = $value['url'];
						if ( ! wp_http_validate_url( $url ) || wp_parse_url( $url, PHP_URL_HOST ) === $home ) {
							continue;
						}
						if ( ! isset( $cache[ $url ] ) ) {
							$id            = media_sideload_image( $url, $post_id, null, 'id' );
							$cache[ $url ] = is_wp_error( $id ) ? 0 : (int) $id;
							if ( $cache[ $url ] ) {
								++$count;
							}
						}
						if ( $cache[ $url ] ) {
							$value['id']     = $cache[ $url ];
							$value['url']    = wp_get_attachment_url( $cache[ $url ] );
							$value['source'] = 'library';
						}
					}
					unset( $value );
				}
				if ( ! empty( $node['elements'] ) ) {
					$walk( $node['elements'] );
				}
			}
			unset( $node );
		};
		$walk( $elements );
		return $count;
	}

	/**
	 * Environment report used by `wp html-to-elementor doctor` and the admin screen.
	 *
	 * @return array<string, array{ok: bool, message: string}>
	 */
	public static function doctor(): array {
		$checks = array();

		$active               = did_action( 'elementor/loaded' ) && defined( 'ELEMENTOR_VERSION' );
		$checks['elementor'] = array(
			'ok'      => $active,
			/* translators: %s: Elementor version. */
			'message' => $active ? sprintf( __( 'Elementor %s is active.', 'html-to-elementor' ), ELEMENTOR_VERSION ) : __( 'Elementor is not active.', 'html-to-elementor' ),
		);

		if ( $active ) {
			$experiments = \Elementor\Plugin::$instance->experiments;
			// Elementor 4 ships containers built in; the experiment no longer exists there.
			$known      = $experiments->get_features( 'container' );
			$containers = ! $known || $experiments->is_feature_active( 'container' );
			$checks['containers'] = array(
				'ok'      => $containers,
				'message' => $containers
					? __( 'Flexbox containers are enabled.', 'html-to-elementor' )
					: __( 'Turn on Elementor › Settings › Features › Flexbox Container, or imported pages will be empty.', 'html-to-elementor' ),
			);
		}

		$node            = HTE_Node::find_binary();
		$checks['node'] = array(
			'ok'      => (bool) $node,
			'message' => $node
				/* translators: %s: path to the node binary. */
				? sprintf( __( 'Node.js found at %s: WP-CLI can convert .html files directly.', 'html-to-elementor' ), $node )
				: __( 'Node.js not found: WP-CLI can import .json files; convert .html in Tools › HTML to Elementor or with the npm CLI.', 'html-to-elementor' ),
		);

		return $checks;
	}
}

/**
 * Runs the bundled converter (bin/convert.mjs) with Node.js, for WP-CLI.
 */
class HTE_Node {

	/**
	 * Path to a node binary, or empty string. Override with the HTE_NODE_BINARY constant.
	 */
	public static function find_binary(): string {
		if ( defined( 'HTE_NODE_BINARY' ) && is_executable( HTE_NODE_BINARY ) ) {
			return HTE_NODE_BINARY;
		}
		if ( ! function_exists( 'proc_open' ) ) {
			return '';
		}
		$finder = 'WIN' === strtoupper( substr( PHP_OS, 0, 3 ) ) ? array( 'where', 'node' ) : array( 'which', 'node' );
		$result = self::run( $finder );
		$path   = trim( strtok( $result['stdout'], "\n" ) );
		return 0 === $result['code'] && '' !== $path ? $path : '';
	}

	/**
	 * Convert an .html file. Returns the decoded {template, report} or WP_Error.
	 *
	 * @param string $file    HTML file path.
	 * @param array  $options base_url, keep_css, canvas, css (list of files), title.
	 * @return array|WP_Error
	 */
	public static function convert( string $file, array $options = array() ) {
		$node = self::find_binary();
		if ( ! $node ) {
			return new WP_Error( 'hte_no_node', __( 'Node.js 18+ is needed to convert .html with WP-CLI. Convert to .json elsewhere (npx html-to-elementor) and import that.', 'html-to-elementor' ) );
		}
		$cmd = array( $node, HTE_DIR . 'bin/convert.mjs', $file, '--stdout' );
		if ( ! empty( $options['title'] ) ) {
			array_push( $cmd, '--title', (string) $options['title'] );
		}
		if ( ! empty( $options['base_url'] ) ) {
			array_push( $cmd, '--base-url', (string) $options['base_url'] );
		}
		if ( ! empty( $options['keep_css'] ) ) {
			$cmd[] = '--keep-css';
		}
		if ( isset( $options['canvas'] ) && ! $options['canvas'] ) {
			$cmd[] = '--no-canvas';
		}
		foreach ( (array) ( $options['css'] ?? array() ) as $css ) {
			array_push( $cmd, '--css', (string) $css );
		}
		$result = self::run( $cmd );
		if ( 0 !== $result['code'] ) {
			return new WP_Error( 'hte_convert_failed', trim( $result['stderr'] ) ? trim( $result['stderr'] ) : __( 'Conversion failed.', 'html-to-elementor' ) );
		}
		$data = json_decode( $result['stdout'], true );
		if ( ! is_array( $data ) || empty( $data['template'] ) ) {
			return new WP_Error( 'hte_convert_failed', __( 'The converter returned unreadable output.', 'html-to-elementor' ) );
		}
		return $data;
	}

	/**
	 * Run a command without a shell (arguments are passed as an array, so nothing is interpolated).
	 *
	 * @param string[] $cmd Command and arguments.
	 * @return array{code: int, stdout: string, stderr: string}
	 */
	private static function run( array $cmd ): array {
		$pipes = array();
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_proc_open -- WP-CLI only, no shell.
		$proc = proc_open( $cmd, array( 1 => array( 'pipe', 'w' ), 2 => array( 'pipe', 'w' ) ), $pipes );
		if ( ! is_resource( $proc ) ) {
			return array(
				'code'   => 1,
				'stdout' => '',
				'stderr' => 'proc_open failed',
			);
		}
		$stdout = stream_get_contents( $pipes[1] );
		$stderr = stream_get_contents( $pipes[2] );
		fclose( $pipes[1] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $pipes[2] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		return array(
			'code'   => proc_close( $proc ),
			'stdout' => (string) $stdout,
			'stderr' => (string) $stderr,
		);
	}
}
