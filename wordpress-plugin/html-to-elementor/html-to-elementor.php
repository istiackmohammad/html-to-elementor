<?php
/**
 * Plugin Name:       HTML to Elementor
 * Plugin URI:        https://github.com/istiackmohammad/html-to-elementor
 * Description:       Convert HTML pages into native Elementor pages and templates (containers + free widgets). Adds Tools › HTML to Elementor and the `wp html-to-elementor` WP-CLI command.
 * Version:           0.2.0
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Requires Plugins:  elementor
 * Author:            Orbitronix
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       html-to-elementor
 *
 * @package HtmlToElementor
 */

defined( 'ABSPATH' ) || exit;

define( 'HTE_VERSION', '0.2.0' );
define( 'HTE_FILE', __FILE__ );
define( 'HTE_DIR', plugin_dir_path( __FILE__ ) );
define( 'HTE_URL', plugin_dir_url( __FILE__ ) );

require_once HTE_DIR . 'includes/class-hte-importer.php';
require_once HTE_DIR . 'includes/class-hte-rest.php';
require_once HTE_DIR . 'includes/class-hte-admin.php';

add_action( 'rest_api_init', array( 'HTE_Rest', 'register_routes' ) );

if ( is_admin() ) {
	HTE_Admin::init();
}

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	require_once HTE_DIR . 'includes/class-hte-cli.php';
	WP_CLI::add_command( 'html-to-elementor', 'HTE_CLI' );
}

add_action(
	'admin_notices',
	static function () {
		if ( did_action( 'elementor/loaded' ) || ! current_user_can( 'activate_plugins' ) ) {
			return;
		}
		echo '<div class="notice notice-warning"><p>' .
			esc_html__( 'HTML to Elementor needs the Elementor plugin to be installed and active.', 'html-to-elementor' ) .
			'</p></div>';
	}
);
