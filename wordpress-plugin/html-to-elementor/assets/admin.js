/* Tools › HTML to Elementor: convert in the browser, import through the REST API. */
(function () {
	'use strict';

	var __ = wp.i18n.__;
	var H = window.HtmlToElementor;
	var cfg = window.hteSettings || {};
	var $ = function (id) { return document.getElementById(id); };
	var current = null;

	function el(tag, text, cls) {
		var n = document.createElement(tag);
		if (text) { n.textContent = text; }
		if (cls) { n.className = cls; }
		return n;
	}

	function notice(container, type, message, link) {
		container.textContent = '';
		var box = el('div', null, 'notice inline notice-' + type);
		var p = el('p', message);
		if (link) {
			p.appendChild(document.createTextNode(' '));
			var a = el('a', link.text);
			a.href = link.href;
			p.appendChild(a);
		}
		box.appendChild(p);
		container.appendChild(box);
	}

	function hasHtmlWidget(nodes) {
		return nodes.some(function (n) {
			return n.widgetType === 'html' || hasHtmlWidget(n.elements || []);
		});
	}

	$('hte-file').addEventListener('change', function (e) {
		var file = e.target.files[0];
		if (!file) { return; }
		file.text().then(function (text) { $('hte-html').value = text; });
	});

	$('hte-convert').addEventListener('click', function () {
		var html = $('hte-html').value.trim();
		var report = $('hte-report');
		$('hte-result').hidden = false;
		$('hte-done').textContent = '';
		if (!html) {
			notice(report, 'error', __('Paste some HTML or choose a file first.', 'html-to-elementor'));
			current = null;
			return;
		}
		try {
			var title = $('hte-title').value.trim() || H.htmlTitle(html) || __('Converted page', 'html-to-elementor');
			var result = H.convert(html, {
				title: title,
				baseUrl: $('hte-base').value.trim(),
				keepCss: $('hte-keepcss').checked,
				canvas: $('hte-canvas').checked
			});
			var as = $('hte-as').value;
			current = { title: title, template: H.toTemplate(result, title, as === 'section' ? 'section' : 'page') };
			renderReport(report, result.report);
			if (hasHtmlWidget(result.elements) && !cfg.canUnfiltered) {
				notice($('hte-done'), 'warning', __('This page needs HTML widgets, which only administrators can import. Download the .zip or ask an administrator.', 'html-to-elementor'));
			}
		} catch (err) {
			current = null;
			notice(report, 'error', __('Conversion failed: ', 'html-to-elementor') + err.message);
		}
	});

	function renderReport(container, r) {
		container.textContent = '';
		var total = Object.keys(r.widgets).reduce(function (s, k) { return s + r.widgets[k]; }, 0);
		container.appendChild(el('p', r.containers + ' ' + __('containers', 'html-to-elementor') + ', ' + total + ' ' + __('widgets', 'html-to-elementor')));
		var ul = el('ul', null, 'hte-counts');
		Object.keys(r.widgets).forEach(function (k) { ul.appendChild(el('li', k + ': ' + r.widgets[k])); });
		container.appendChild(ul);
		if (r.htmlFallbacks.length) {
			container.appendChild(el('p', __('Kept as HTML widgets: ', 'html-to-elementor') + r.htmlFallbacks.join(', ')));
		}
		r.warnings.forEach(function (w) {
			var box = el('div', null, 'notice inline notice-warning');
			box.appendChild(el('p', w));
			container.appendChild(box);
		});
	}

	$('hte-import').addEventListener('click', function () {
		if (!current) { return; }
		var btn = this;
		var done = $('hte-done');
		btn.disabled = true;
		notice(done, 'info', __('Creating…', 'html-to-elementor'));
		wp.apiFetch({
			path: cfg.route,
			method: 'POST',
			data: {
				template: current.template,
				title: current.title,
				as: $('hte-as').value,
				status: $('hte-status').value,
				sideload_images: $('hte-sideload').checked
			}
		}).then(function (res) {
			notice(done, 'success', __('Done.', 'html-to-elementor'), { href: res.edit_url, text: __('Edit with Elementor', 'html-to-elementor') });
		}).catch(function (err) {
			notice(done, 'error', (err && err.message) || __('Import failed.', 'html-to-elementor'));
		}).finally(function () {
			btn.disabled = false;
		});
	});

	$('hte-download').addEventListener('click', function () {
		if (!current) { return; }
		var blob = new Blob([H.templateZip(current.template)], { type: 'application/zip' });
		var a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = H.slugify(current.title) + '.zip';
		document.body.appendChild(a);
		a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
	});
}());
