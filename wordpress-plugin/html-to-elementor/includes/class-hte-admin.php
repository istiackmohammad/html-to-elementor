<?php
/**
 * Tools › HTML to Elementor screen.
 *
 * @package HtmlToElementor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Admin screen: paste or upload HTML, convert in the browser, import through the REST endpoint.
 */
class HTE_Admin {

	const SLUG = 'html-to-elementor';

	/**
	 * Hook in.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( HTE_FILE ), array( __CLASS__, 'action_links' ) );
	}

	/**
	 * Register the Tools submenu.
	 */
	public static function menu() {
		add_management_page(
			__( 'HTML to Elementor', 'html-to-elementor' ),
			__( 'HTML to Elementor', 'html-to-elementor' ),
			'edit_pages',
			self::SLUG,
			array( __CLASS__, 'render' )
		);
	}

	/**
	 * Link from the plugins list.
	 *
	 * @param string[] $links Links.
	 * @return string[]
	 */
	public static function action_links( $links ) {
		array_unshift(
			$links,
			'<a href="' . esc_url( admin_url( 'tools.php?page=' . self::SLUG ) ) . '">' . esc_html__( 'Convert HTML', 'html-to-elementor' ) . '</a>'
		);
		return $links;
	}

	/**
	 * Scripts and styles, only on our screen.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public static function assets( $hook ) {
		if ( 'tools_page_' . self::SLUG !== $hook ) {
			return;
		}
		wp_enqueue_style( 'hte-admin', HTE_URL . 'assets/admin.css', array(), HTE_VERSION );
		wp_enqueue_script( 'hte-converter', HTE_URL . 'assets/converter.js', array(), HTE_VERSION, true );
		wp_enqueue_script( 'hte-admin', HTE_URL . 'assets/admin.js', array( 'hte-converter', 'wp-api-fetch', 'wp-i18n' ), HTE_VERSION, true );
		wp_set_script_translations( 'hte-admin', 'html-to-elementor' );
		wp_add_inline_script(
			'hte-admin',
			'window.hteSettings = ' . wp_json_encode(
				array(
					'route'          => '/' . HTE_Rest::NAMESPACE_V1 . '/import',
					'canPublish'     => current_user_can( 'publish_pages' ),
					'canUnfiltered'  => current_user_can( 'unfiltered_html' ),
					'canTemplates'   => current_user_can( 'edit_posts' ),
				)
			) . ';',
			'before'
		);
	}

	/**
	 * Render the screen.
	 */
	public static function render() {
		if ( ! current_user_can( 'edit_pages' ) ) {
			wp_die( esc_html__( 'You are not allowed to access this page.', 'html-to-elementor' ) );
		}
		$checks = HTE_Importer::doctor();
		unset( $checks['node'] ); // Not needed here: this screen converts in the browser.
		?>
		<div class="wrap hte">
			<h1><?php esc_html_e( 'HTML to Elementor', 'html-to-elementor' ); ?></h1>
			<p class="hte-lead"><?php esc_html_e( 'Paste a page or upload an .html file. It is converted in your browser into Elementor containers and widgets, then saved as a page or template you can edit with Elementor.', 'html-to-elementor' ); ?></p>

			<?php foreach ( $checks as $check ) : ?>
				<?php if ( ! $check['ok'] ) : ?>
					<div class="notice notice-error inline"><p><?php echo esc_html( $check['message'] ); ?></p></div>
				<?php endif; ?>
			<?php endforeach; ?>

			<div class="hte-grid">
				<div class="hte-card">
					<h2><?php esc_html_e( '1. Your HTML', 'html-to-elementor' ); ?></h2>
					<p><input type="file" id="hte-file" accept=".html,.htm,text/html"></p>
					<textarea id="hte-html" rows="16" spellcheck="false" placeholder="<!DOCTYPE html>..."></textarea>
					<p class="description"><?php esc_html_e( 'Keep the CSS in <style> tags. External stylesheets and Tailwind classes are not read.', 'html-to-elementor' ); ?></p>
				</div>

				<div class="hte-card">
					<h2><?php esc_html_e( '2. Options', 'html-to-elementor' ); ?></h2>
					<p>
						<label for="hte-title"><?php esc_html_e( 'Title', 'html-to-elementor' ); ?></label>
						<input type="text" id="hte-title" class="widefat" placeholder="<?php esc_attr_e( 'Defaults to the page <title>', 'html-to-elementor' ); ?>">
					</p>
					<p>
						<label for="hte-as"><?php esc_html_e( 'Create', 'html-to-elementor' ); ?></label>
						<select id="hte-as">
							<option value="page"><?php esc_html_e( 'Page', 'html-to-elementor' ); ?></option>
							<option value="template"><?php esc_html_e( 'Saved template (page)', 'html-to-elementor' ); ?></option>
							<option value="section"><?php esc_html_e( 'Saved template (section)', 'html-to-elementor' ); ?></option>
						</select>
						<select id="hte-status">
							<option value="draft"><?php esc_html_e( 'Draft', 'html-to-elementor' ); ?></option>
							<option value="publish"><?php esc_html_e( 'Published', 'html-to-elementor' ); ?></option>
							<option value="private"><?php esc_html_e( 'Private', 'html-to-elementor' ); ?></option>
						</select>
					</p>
					<p>
						<label for="hte-base"><?php esc_html_e( 'Base URL for relative images', 'html-to-elementor' ); ?></label>
						<input type="url" id="hte-base" class="widefat" placeholder="https://example.com/wp-content/uploads/">
					</p>
					<p><label><input type="checkbox" id="hte-canvas" checked> <?php esc_html_e( 'Use Elementor Canvas (no theme header/footer)', 'html-to-elementor' ); ?></label></p>
					<p><label><input type="checkbox" id="hte-sideload"> <?php esc_html_e( 'Copy remote images into the Media Library', 'html-to-elementor' ); ?></label></p>
					<p><label><input type="checkbox" id="hte-keepcss"> <?php esc_html_e( 'Also embed the original CSS (closer look, adds an HTML widget)', 'html-to-elementor' ); ?></label></p>
					<p>
						<button type="button" class="button button-primary" id="hte-convert"><?php esc_html_e( 'Convert', 'html-to-elementor' ); ?></button>
					</p>
				</div>
			</div>

			<div class="hte-card hte-result" id="hte-result" hidden>
				<h2><?php esc_html_e( '3. Result', 'html-to-elementor' ); ?></h2>
				<div id="hte-report"></div>
				<p>
					<button type="button" class="button button-primary" id="hte-import"><?php esc_html_e( 'Create in WordPress', 'html-to-elementor' ); ?></button>
					<button type="button" class="button" id="hte-download"><?php esc_html_e( 'Download .zip', 'html-to-elementor' ); ?></button>
				</p>
				<div id="hte-done" aria-live="polite"></div>
			</div>
		</div>
		<?php
	}
}
