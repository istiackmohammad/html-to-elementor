<?php
/**
 * REST endpoint used by the admin screen (and available to external tools).
 *
 * POST /wp-json/html-to-elementor/v1/import
 *
 * @package HtmlToElementor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers the import route.
 */
class HTE_Rest {

	const NAMESPACE_V1 = 'html-to-elementor/v1';

	/**
	 * Register routes.
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/import',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'import' ),
				'permission_callback' => static function () {
					return current_user_can( 'edit_pages' ) || current_user_can( 'edit_posts' );
				},
				'args'                => array(
					'template'        => array(
						'type'        => 'object',
						'required'    => true,
						'description' => 'Elementor template export ({content, page_settings, title, type}) or {content: [elements]}.',
					),
					'title'           => array(
						'type'              => 'string',
						'default'           => '',
						'sanitize_callback' => 'sanitize_text_field',
					),
					'as'              => array(
						'type'    => 'string',
						'enum'    => array( 'page', 'template', 'section' ),
						'default' => 'page',
					),
					'status'          => array(
						'type'    => 'string',
						'enum'    => array( 'draft', 'publish', 'private', 'pending' ),
						'default' => 'draft',
					),
					'post_id'         => array(
						'type'    => 'integer',
						'default' => 0,
						'minimum' => 0,
					),
					'sideload_images' => array(
						'type'    => 'boolean',
						'default' => false,
					),
				),
			)
		);
	}

	/**
	 * Handle an import request.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function import( WP_REST_Request $request ) {
		if ( 'publish' === $request['status'] && 'page' === $request['as'] && ! current_user_can( 'publish_pages' ) ) {
			return new WP_Error( 'hte_forbidden', __( 'You are not allowed to publish pages.', 'html-to-elementor' ), array( 'status' => 403 ) );
		}
		$result = HTE_Importer::import(
			(array) $request['template'],
			array(
				'title'           => $request['title'],
				'as'              => $request['as'],
				'status'          => $request['status'],
				'post_id'         => (int) $request['post_id'],
				'sideload_images' => (bool) $request['sideload_images'],
				'check_caps'      => true,
			)
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return rest_ensure_response( $result );
	}
}
