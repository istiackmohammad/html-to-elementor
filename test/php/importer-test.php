<?php
/**
 * Plugin logic tests without WordPress: the few WP functions used are stubbed.
 * Run: npm run build && php test/php/importer-test.php
 */
$tmp = sys_get_temp_dir() . '/hte-php-test/';
define('ABSPATH', $tmp);
define('HTE_DIR', dirname(__DIR__, 2) . '/wordpress-plugin/html-to-elementor/');
define('HTE_VERSION', '0.2.0');
class WP_Error { public $code,$msg; function __construct($c='',$m=''){$this->code=$c;$this->msg=$m;} function get_error_message(){return $this->msg;} }
function is_wp_error($x){ return $x instanceof WP_Error; }
function __($s){ return $s; }
function wp_parse_args($a,$d){ return array_merge($d,$a); }
function home_url(){ return 'https://mysite.test'; }
function wp_parse_url($u,$c=-1){ return parse_url($u,$c); }
function wp_http_validate_url($u){ return (bool) filter_var($u, FILTER_VALIDATE_URL); }
$GLOBALS['sideloaded']=[];
function media_sideload_image($url,$post,$d,$ret){ $GLOBALS['sideloaded'][]=$url; return 100+count($GLOBALS['sideloaded']); }
function wp_get_attachment_url($id){ return "https://mysite.test/wp-content/uploads/img-$id.jpg"; }
@mkdir(ABSPATH.'wp-admin/includes',0777,true);
foreach(['media','file','image'] as $f) file_put_contents(ABSPATH."wp-admin/includes/$f.php","<?php\n");
require HTE_DIR . 'includes/class-hte-importer.php';
$ok=0;$fail=0;
function check($name,$cond){ global $ok,$fail; echo ($cond?'PASS ':'FAIL ').$name."\n"; $cond?$ok++:$fail++; }

// 1. WP-CLI bridge: convert the example with the bundled Node script
$r = HTE_Node::convert(dirname(__DIR__, 2) . '/examples/landing.html', ['base_url'=>'https://cdn.test/']);
check('node bridge converts .html', is_array($r) && count($r['template']['content'])===6 && $r['template']['title']==='Brightline Studio');
$els = $r['template']['content'];
check('converted tree passes validation', HTE_Importer::validate($els)===true);
check('example has no HTML widget', HTE_Importer::has_html_widget($els)===false);
$bad = HTE_Node::convert(__DIR__ . '/does-not-exist.html');
check('missing file returns WP_Error', is_wp_error($bad) && $bad->code==='hte_convert_failed');

// 2. validation rejects malformed input
check('rejects empty', is_wp_error(HTE_Importer::validate([])));
check('rejects object instead of list', is_wp_error(HTE_Importer::validate(['a'=>['id'=>'x']])));
check('rejects unknown elType', is_wp_error(HTE_Importer::validate([['id'=>'a','elType'=>'script','settings'=>[],'elements'=>[]]])));
check('rejects bad widgetType', is_wp_error(HTE_Importer::validate([['id'=>'a','elType'=>'widget','widgetType'=>'x"><script>','settings'=>[]]])));
$deep = []; for($i=0;$i<60;$i++){ $deep=[['id'=>"d$i",'elType'=>'container','settings'=>[],'elements'=>$deep]]; }
check('rejects 60-deep nesting', is_wp_error(HTE_Importer::validate($deep)));
$many = array_fill(0,5001,['id'=>'w','elType'=>'widget','widgetType'=>'heading','settings'=>[]]);
check('rejects >5000 elements', is_wp_error(HTE_Importer::validate($many)));

// 3. html widget detection (gates unfiltered_html)
check('detects nested html widget', HTE_Importer::has_html_widget([['elType'=>'container','elements'=>[['elType'=>'widget','widgetType'=>'html']]]]));

// 4. sideloading rewrites remote image settings, skips local + already-library ones, dedupes
$sl = [['id'=>'c','elType'=>'container','settings'=>['background_image'=>['url'=>'https://img.test/bg.jpg','id'=>'']],'elements'=>[
  ['id'=>'i1','elType'=>'widget','widgetType'=>'image','settings'=>['image'=>['url'=>'https://img.test/a.jpg','id'=>'']]],
  ['id'=>'i2','elType'=>'widget','widgetType'=>'image','settings'=>['image'=>['url'=>'https://img.test/a.jpg','id'=>'']]],
  ['id'=>'i3','elType'=>'widget','widgetType'=>'image','settings'=>['image'=>['url'=>'https://mysite.test/local.jpg','id'=>'']]],
  ['id'=>'i4','elType'=>'widget','widgetType'=>'image','settings'=>['image'=>['url'=>'https://img.test/b.jpg','id'=>7]]],
]]];
$n = HTE_Importer::sideload_images($sl, 5);
check('sideloaded 2 unique remote images', $n===2 && $GLOBALS['sideloaded']===['https://img.test/bg.jpg','https://img.test/a.jpg']);
check('rewrote url + id + source', $sl[0]['elements'][0]['settings']['image']['id']===102 && $sl[0]['elements'][1]['settings']['image']['id']===102 && $sl[0]['settings']['background_image']['source']==='library');
check('left local and library images alone', $sl[0]['elements'][2]['settings']['image']['id']==='' && $sl[0]['elements'][3]['settings']['image']['id']===7);
echo "\n$ok passed, $fail failed\n";
