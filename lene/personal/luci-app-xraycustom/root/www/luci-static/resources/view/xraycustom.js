'use strict';
'require view';
'require fs';
'require ui';

return view.extend({
	logWrap: null,
	logBox: null,
	statusBox: null,
	versionSelectEl: null,
	currentVersionRaw: '',
	currentStatus: {},
	currentVersions: [],
	latestOfficial: '-',
	themeObserver: null,
	OFFICIAL_VALUE: '__XRAY_OFFICIAL_LATEST__',

	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	load: function() {
		return Promise.all([
			fs.exec('/bin/sh', [ '/usr/bin/xraycustom', 'status' ]).catch(function() {
				return { stdout: '{}' };
			}),
			fs.exec('/bin/sh', [ '/usr/bin/xraycustom', 'versions' ]).catch(function() {
				return { stdout: '[]' };
			}),
			fs.exec('/usr/bin/xray', [ 'version' ]).catch(function() {
				return { stdout: '' };
			}),
			fs.exec('/bin/sh', [ '/usr/bin/xraycustom', 'latest' ]).catch(function() {
				return { stdout: '{"latest_official":"-"}' };
			})
		]);
	},

	showLog: function() {
		if (this.logWrap)
			this.logWrap.style.display = '';
	},

	clearLog: function() {
		if (this.logBox)
			this.logBox.textContent = '';
	},

	addLog: function(msg) {
		if (!this.logBox)
			return;

		this.logBox.textContent += String(msg || '') + '\n';
		this.logBox.scrollTop = this.logBox.scrollHeight;
	},

	escapeHtml: function(s) {
		if (s == null)
			return '';

		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	},

	parseJsonSafe: function(raw, fallback) {
		try {
			return JSON.parse(raw || '');
		}
		catch (e) {
			return fallback;
		}
	},

	parseRgb: function(color) {
		var m;

		if (!color)
			return null;

		color = String(color).trim();

		if (color.indexOf('rgb(') === 0 || color.indexOf('rgba(') === 0) {
			m = color.match(/rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i);
			if (m)
				return [ parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]) ];
		}

		if (color.charAt(0) === '#') {
			if (color.length === 4) {
				return [
					parseInt(color.charAt(1) + color.charAt(1), 16),
					parseInt(color.charAt(2) + color.charAt(2), 16),
					parseInt(color.charAt(3) + color.charAt(3), 16)
				];
			}

			if (color.length === 7) {
				return [
					parseInt(color.substr(1, 2), 16),
					parseInt(color.substr(3, 2), 16),
					parseInt(color.substr(5, 2), 16)
				];
			}
		}

		return null;
	},

	getLuminance: function(rgb) {
		if (!rgb || rgb.length < 3)
			return 255;

		return (0.299 * rgb[0]) + (0.587 * rgb[1]) + (0.114 * rgb[2]);
	},

	isDarkMode: function() {
		var body = document.body;
		var html = document.documentElement;
		var cls = ((body ? body.className : '') + ' ' + (html ? html.className : '')).toLowerCase();
		var bg, rgb, lum;

		if (cls.indexOf('dark') !== -1 || cls.indexOf('night') !== -1)
			return true;

		if (cls.indexOf('light') !== -1)
			return false;

		bg = window.getComputedStyle(body || html).backgroundColor || '';
		rgb = this.parseRgb(bg);
		lum = this.getLuminance(rgb);

		return lum < 145;
	},

	getThemePalette: function() {
		if (this.isDarkMode()) {
			return {
				sectionBg: 'rgba(255,255,255,0.08)',
				sectionBorder: 'rgba(255,255,255,0.06)',
				sectionShadow: '0 10px 24px rgba(0,0,0,0.22)',
				sectionTitleBg: 'rgba(255,255,255,0.10)',
				cardBg: 'rgba(255,255,255,0.2)',
				cardText: '#f8fafc',
				cardLabel: 'rgba(255,255,255,0.78)',
				selectBg: '#111318',
				selectText: '#f8fafc',
				selectBorder: 'rgba(255,255,255,0.12)',
				logBg: '#0b1220',
				logText: '#e5e7eb',
				typeStrx: '#22c55e',
				typeStock: '#f59e0b',
				latestColor: '#60a5fa',
				titleText: '#fcfcfc',
				descText: 'rgba(255,255,255,0.82)'
			};
		}

		return {
			sectionBg: 'rgba(255,255,255,0.78)',
			sectionBorder: 'rgba(0,0,0,0.05)',
			sectionShadow: '0 8px 22px rgba(17,24,39,0.06)',
			sectionTitleBg: 'rgba(0,0,0,0.04)',
			cardBg: 'rgba(224, 231, 248, 0.5)',
			cardText: '#000000',
			cardLabel: 'rgba(0, 0, 0, 0.78)',
			selectBg: '#ffffff',
			selectText: '#111827',
			selectBorder: 'rgba(0,0,0,0.10)',
			logBg: '#111827',
			logText: '#e5e7eb',
			typeStrx: '#22c55e',
			typeStock: '#f59e0b',
			latestColor: '#2563eb',
			titleText: '#1f2a44',
			descText: '#374151'
		};
	},

	detectCoreType: function(verRaw) {
		var s;

		if (!verRaw)
			return 'Unknown';

		s = String(verRaw).toLowerCase();

		if (s.indexOf('strx') !== -1)
			return 'STRX Mod';

		return 'Stock';
	},

	normalizeVersion: function(ver) {
		if (!ver)
			return '';

		return String(ver).trim();
	},

	isExactInstalledVersion: function(selected) {
		var st = this.currentStatus || {};
		var current = this.normalizeVersion(st.current_version || st.installed_version || '');
		var picked = this.normalizeVersion(selected);

		if (!picked || !current)
			return false;

		return picked === current;
	},

	getBuildLine: function(verRaw) {
		var lines;

		if (!verRaw)
			return '-';

		lines = String(verRaw).replace(/\r/g, '').split('\n').filter(function(line) {
			return line && line.trim() !== '';
		});

		if (!lines.length)
			return '-';

		if (lines.length >= 2)
			return lines[0] + ' | ' + lines[1];

		return lines[0];
	},

	getLatestLocalVersion: function(versions) {
		if (!Array.isArray(versions) || !versions.length)
			return '-';

		return versions[versions.length - 1] || '-';
	},

	getCurrentDisplayVersion: function() {
		var st = this.currentStatus || {};
		return this.normalizeVersion(st.current_version || st.installed_version || '');
	},

	detectCoreTypeHtml: function(verRaw) {
		var type = this.detectCoreType(verRaw);

		if (type === 'STRX Mod')
			return '<span class="xray-type-strx">STRX Mod</span>';

		if (type === 'Stock')
			return '<span class="xray-type-stock">Stock</span>';

		return '<span class="xray-type-unknown">Unknown</span>';
	},

	updateStatusBox: function(st, verRaw) {
		var html;
		var detected;
		var saved;
		var target;
		var buildLine;
		var coreType;
		var latestLocal;
		var latestOfficial;

		if (!this.statusBox)
			return;

		detected = st.current_version || '-';
		saved = st.installed_version || '-';
		target = st.binary_path || st.target_path || '/usr/bin/xray';
		buildLine = this.escapeHtml(this.getBuildLine(verRaw || st.version_raw || ''));
		coreType = this.detectCoreTypeHtml(verRaw || st.version_raw || detected);
		latestLocal = this.getLatestLocalVersion(this.currentVersions);
		latestOfficial = this.latestOfficial || '-';

		html =
			'<div class="xray-status-grid">' +
				'<div class="xray-status-card">' +
					'<div class="xray-status-label">Detected</div>' +
					'<div class="xray-status-value">' + this.escapeHtml(detected) + '</div>' +
				'</div>' +
				'<div class="xray-status-card">' +
					'<div class="xray-status-label">Core Type</div>' +
					'<div class="xray-status-value">' + coreType + '</div>' +
				'</div>' +
				'<div class="xray-status-card">' +
					'<div class="xray-status-label">Saved</div>' +
					'<div class="xray-status-value">' + this.escapeHtml(saved) + '</div>' +
				'</div>' +
				'<div class="xray-status-card">' +
					'<div class="xray-status-label">Latest Official</div>' +
					'<div class="xray-status-value"><span class="xray-latest-build">' + this.escapeHtml(latestOfficial) + '</span></div>' +
				'</div>' +
				'<div class="xray-status-card">' +
					'<div class="xray-status-label">Latest Local Mod</div>' +
					'<div class="xray-status-value">' + this.escapeHtml(latestLocal) + '</div>' +
				'</div>' +
				'<div class="xray-status-card">' +
					'<div class="xray-status-label">Target</div>' +
					'<div class="xray-status-value xray-break">' + this.escapeHtml(target) + '</div>' +
				'</div>' +
				'<div class="xray-status-card xray-status-card-full">' +
					'<div class="xray-status-label">Build</div>' +
					'<div class="xray-status-value xray-break">' + buildLine + '</div>' +
				'</div>' +
			'</div>';

		this.statusBox.innerHTML = html;
	},

	updateVersionSelect: function(versions) {
		var i, opt, st, current, saved, latestLocal, officialOpt, placeholderOpt, currentDisplay;

		if (!this.versionSelectEl)
			return;

		this.versionSelectEl.innerHTML = '';
		st = this.currentStatus || {};
		current = this.normalizeVersion(st.current_version || '');
		saved = this.normalizeVersion(st.installed_version || '');
		latestLocal = this.normalizeVersion(this.getLatestLocalVersion(versions));
		currentDisplay = this.getCurrentDisplayVersion();

		placeholderOpt = document.createElement('option');
		placeholderOpt.value = '';
		placeholderOpt.text = currentDisplay ? ('Current version: ' + currentDisplay) : _('Select version to install');
		placeholderOpt.disabled = true;
		placeholderOpt.selected = true;
		placeholderOpt.hidden = true;
		this.versionSelectEl.appendChild(placeholderOpt);

		if (this.latestOfficial && this.latestOfficial !== '-') {
			officialOpt = document.createElement('option');
			officialOpt.value = this.OFFICIAL_VALUE;
			officialOpt.text = this.latestOfficial + ' (latest official)';
			this.versionSelectEl.appendChild(officialOpt);
		}

		if (Array.isArray(versions) && versions.length > 0) {
			for (i = 0; i < versions.length; i++) {
				opt = document.createElement('option');
				opt.value = versions[i];

				if (this.normalizeVersion(versions[i]) === current)
					opt.text = versions[i] + ' (current)';
				else if (this.normalizeVersion(versions[i]) === saved)
					opt.text = versions[i] + ' (saved)';
				else if (this.normalizeVersion(versions[i]) === latestLocal)
					opt.text = versions[i] + ' (latest mod)';
				else
					opt.text = versions[i];

				this.versionSelectEl.appendChild(opt);
			}
		}
	},

	applyThemeColors: function() {
		var p = this.getThemePalette();
		var root = document.documentElement;

		root.style.setProperty('--xray-section-bg', p.sectionBg);
		root.style.setProperty('--xray-section-border', p.sectionBorder);
		root.style.setProperty('--xray-section-shadow', p.sectionShadow);
		root.style.setProperty('--xray-section-title-bg', p.sectionTitleBg);
		root.style.setProperty('--xray-card-bg', p.cardBg);
		root.style.setProperty('--xray-card-text', p.cardText);
		root.style.setProperty('--xray-card-label', p.cardLabel);
		root.style.setProperty('--xray-select-bg', p.selectBg);
		root.style.setProperty('--xray-select-text', p.selectText);
		root.style.setProperty('--xray-select-border', p.selectBorder);
		root.style.setProperty('--xray-log-bg', p.logBg);
		root.style.setProperty('--xray-log-text', p.logText);
		root.style.setProperty('--xray-type-strx-color', p.typeStrx);
		root.style.setProperty('--xray-type-stock-color', p.typeStock);
		root.style.setProperty('--xray-latest-color', p.latestColor);
		root.style.setProperty('--xray-title-text', p.titleText);
		root.style.setProperty('--xray-desc-text', p.descText);
	},

	startThemeWatcher: function() {
		var self = this;

		self.applyThemeColors();

		if (self.themeObserver)
			return;

		self.themeObserver = new MutationObserver(function() {
			self.applyThemeColors();
		});

		if (document.body) {
			self.themeObserver.observe(document.body, {
				attributes: true,
				attributeFilter: [ 'class', 'style' ]
			});
		}

		if (document.documentElement) {
			self.themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: [ 'class', 'style' ]
			});
		}
	},

	handleInstall: function(ev) {
		var self = this;
		var selected = this.versionSelectEl ? this.versionSelectEl.value : '';
		var cmd;

		if (ev)
			ui.hideModal();

		if (!selected) {
			ui.addNotification(null, E('p', _('Please select a version first.')));
			return Promise.resolve();
		}

		if (selected !== this.OFFICIAL_VALUE && self.isExactInstalledVersion(selected)) {
			ui.addNotification(null, E('p', _('Blocked: selected version is already installed.')));
			return Promise.resolve();
		}

		self.showLog();
		self.clearLog();
		self.addLog('>>> Xray Custom Install Session >>>');

		if (selected === this.OFFICIAL_VALUE) {
			self.addLog('>>> Installing official latest: ' + (this.latestOfficial || '-'));
			cmd = fs.exec('/bin/sh', [ '/usr/bin/xraycustom', 'install-official' ]);
		}
		else {
			self.addLog('>>> Installing mod version: ' + selected);
			cmd = fs.exec('/bin/sh', [ '/usr/bin/xraycustom', 'install', selected ]);
		}

		return cmd.then(function(res) {
			var out = {};
			var raw = (res && res.stdout) ? res.stdout : '';

			self.addLog(raw || '(no output)');

			try {
				out = JSON.parse(raw || '{}');
			}
			catch (e) {
				self.addLog('>>> INSTALL PARSE ERROR: ' + e);
				ui.addNotification(null, E('p', _('Install failed: invalid response')));
				return;
			}

			if (out.ok) {
				self.addLog('>>> SUCCESS: Installed ' + (out.installed_version || selected));
				ui.addNotification(null, E('p', _('Installed version ') + (out.installed_version || selected) + _(' to /usr/bin/xray')));
				return self.refreshAllAfterInstall();
			}

			self.addLog('>>> ERROR: ' + (out.error || 'unknown error'));
			ui.addNotification(null, E('p', _('Install failed: ') + (out.error || 'unknown error')));
		}).catch(function(err) {
			self.addLog('>>> EXEC ERROR: ' + err);
			ui.addNotification(null, E('p', _('Install failed: ') + err));
		});
	},

	handleRollback: function(ev) {
		var self = this;

		if (ev)
			ui.hideModal();

		self.showLog();
		self.clearLog();
		self.addLog('>>> Xray Custom Rollback Session >>>');
		self.addLog('>>> Rolling back backup');

		return fs.exec('/bin/sh', [ '/usr/bin/xraycustom', 'rollback' ]).then(function(res) {
			var out = {};
			var raw = (res && res.stdout) ? res.stdout : '';

			self.addLog(raw || '(no output)');

			try {
				out = JSON.parse(raw || '{}');
			}
			catch (e) {
				self.addLog('>>> ROLLBACK PARSE ERROR: ' + e);
				ui.addNotification(null, E('p', _('Rollback failed: invalid response')));
				return;
			}

			if (out.ok) {
				self.addLog('>>> SUCCESS: Rollback completed');
				ui.addNotification(null, E('p', _('Rollback completed successfully.')));
				return self.refreshAllAfterInstall();
			}

			self.addLog('>>> ERROR: ' + (out.error || 'unknown error'));
			ui.addNotification(null, E('p', _('Rollback failed: ') + (out.error || 'unknown error')));
		}).catch(function(err) {
			self.addLog('>>> EXEC ERROR: ' + err);
			ui.addNotification(null, E('p', _('Rollback failed: ') + err));
		});
	},

	handleReload: function(ev) {
		if (ev)
			ui.hideModal();

		return this.refreshAll();
	},

	refreshOfficialLatest: function(logIt) {
		var self = this;

		return fs.exec('/bin/sh', [ '/usr/bin/xraycustom', 'latest' ]).then(function(res) {
			var out = self.parseJsonSafe((res && res.stdout) ? res.stdout : '{}', {});
			self.latestOfficial = out.latest_official || '-';

			if (logIt)
				self.addLog('>>> Latest official: ' + self.latestOfficial);
		}).catch(function(err) {
			self.latestOfficial = '-';

			if (logIt)
				self.addLog('>>> LATEST ERROR: ' + err);
		});
	},

	refreshStatus: function(logIt) {
		var self = this;

		return Promise.all([
			fs.exec('/bin/sh', [ '/usr/bin/xraycustom', 'status' ]).catch(function() {
				return { stdout: '{}' };
			}),
			fs.exec('/usr/bin/xray', [ 'version' ]).catch(function() {
				return { stdout: '' };
			})
		]).then(function(res) {
			var st = {};
			var verRaw = '';

			try {
				st = JSON.parse(res[0].stdout || '{}');
			}
			catch (e) {
				if (logIt)
					self.addLog('>>> STATUS PARSE ERROR: ' + e);
				return;
			}

			verRaw = (res[1] && res[1].stdout) ? res[1].stdout : '';
			self.currentVersionRaw = verRaw;
			self.currentStatus = st;
			self.updateStatusBox(st, verRaw);
			self.updateVersionSelect(self.currentVersions);
			self.applyThemeColors();

			if (logIt)
				self.addLog('>>> Status refreshed');
		}).catch(function(err) {
			if (logIt)
				self.addLog('>>> STATUS ERROR: ' + err);
		});
	},

	refreshVersions: function(logIt) {
		var self = this;

		return fs.exec('/bin/sh', [ '/usr/bin/xraycustom', 'versions' ]).then(function(res) {
			var versions = [];

			if (logIt && res && res.stdout)
				self.addLog(res.stdout);

			try {
				versions = JSON.parse(res.stdout || '[]');
			}
			catch (e) {
				if (logIt)
					self.addLog('>>> VERSION PARSE ERROR: ' + e);

				ui.addNotification(null, E('p', _('Failed to parse version list.')));
				return;
			}

			self.currentVersions = versions;
			self.updateVersionSelect(versions);

			if (logIt) {
				self.addLog('>>> Version list refreshed: ' + versions.length + ' item(s)');
				self.addLog('>>> Latest local mod: ' + self.getLatestLocalVersion(versions));
			}
		}).catch(function(err) {
			if (logIt)
				self.addLog('>>> VERSION LOAD ERROR: ' + err);

			ui.addNotification(null, E('p', _('Failed to reload version list: ') + err));
		});
	},

	refreshAll: function() {
		var self = this;

		self.showLog();
		self.clearLog();
		self.addLog('>>> Xray Custom Reload Session >>>');
		self.addLog('>>> Reloading local mod list + official latest');

		return Promise.all([
			self.refreshVersions(true),
			self.refreshOfficialLatest(true)
		]).then(function() {
			return self.refreshStatus(true);
		}).then(function() {
			ui.addNotification(null, E('p', _('Version list and official latest refreshed successfully.')));
		});
	},

	refreshAllAfterInstall: function() {
		var self = this;

		return Promise.all([
			self.refreshVersions(false),
			self.refreshOfficialLatest(false)
		]).then(function() {
			return self.refreshStatus(true);
		});
	},

	render: function(data) {
		var self = this;
		var status = {};
		var versions = [];
		var versionRaw = '';
		var latestOut = {};

		try {
			status = JSON.parse(data[0].stdout || '{}');
		}
		catch (e) {
			status = {};
		}

		try {
			versions = JSON.parse(data[1].stdout || '[]');
		}
		catch (e2) {
			versions = [];
		}

		versionRaw = (data[2] && data[2].stdout) ? data[2].stdout : '';
		latestOut = this.parseJsonSafe((data[3] && data[3].stdout) ? data[3].stdout : '{}', {});

		self.currentVersionRaw = versionRaw;
		self.currentStatus = status;
		self.currentVersions = versions;
		self.latestOfficial = latestOut.latest_official || '-';

		var root = E('div', { 'class': 'cbi-map xray-custom-page' }, [
			E('style', {}, [`
				:root {
					--xray-section-bg: rgba(255,255,255,0.78);
					--xray-section-border: rgba(0,0,0,0.05);
					--xray-section-shadow: 0 8px 22px rgba(17,24,39,0.06);
					--xray-section-title-bg: rgba(0,0,0,0.04);
					--xray-card-bg: rgba(255, 255, 255, 0.5);
					--xray-card-text: #f8fafc;
					--xray-card-label: rgba(255,255,255,0.78);
					--xray-select-bg: #ffffff;
					--xray-select-text: #111827;
					--xray-select-border: rgba(0,0,0,0.10);
					--xray-log-bg: #111827;
					--xray-log-text: #e5e7eb;
					--xray-type-strx-color: #22c55e;
					--xray-type-stock-color: #f59e0b;
					--xray-latest-color: #ffffff;
					--xray-title-text: #ffffff;
					--xray-desc-text: #ffffff;
				}

				.xray-custom-page h2 {
					color: var(--xray-title-text);
				}

				.xray-custom-page > .cbi-map-descr {
					margin-bottom: 16px;
					line-height: 1.7;
					color: var(--xray-desc-text);
				}

				.xray-section {
					background: var(--xray-section-bg);
					border: 1px solid var(--xray-section-border);
					border-radius: 6px;
					padding: 16px;
					margin-top: 12px;
					box-shadow: var(--xray-section-shadow);
					backdrop-filter: blur(6px);
					-webkit-backdrop-filter: blur(6px);
				}

				.xray-section-title {
					margin: 0 0 14px 0;
					padding: 14px 16px;
					border-radius: 6px;
					background: var(--xray-section-title-bg);
					color: var(--xray-title-text);
				}

				.xray-log-box {
					display: block;
					width: 100%;
					min-height: 150px;
					max-height: 280px;
					overflow: auto;
					box-sizing: border-box;
					padding: 14px 16px;
					border-radius: 6px;
					background: var(--xray-log-bg);
					color: var(--xray-log-text);
					font-family: Menlo, Monaco, Consolas, monospace;
					font-size: 12px;
					line-height: 1.65;
					white-space: pre-wrap;
					word-break: break-word;
				}

				.xray-status-grid {
					display: grid;
					grid-template-columns: repeat(3, minmax(0, 1fr));
					gap: 12px;
					margin: 0 0 16px 0;
				}

				.xray-status-card {
					background: var(--xray-card-bg);
					color: var(--xray-card-text);
					border-radius: 6px;
					padding: 14px 16px;
					box-sizing: border-box;
					min-width: 0;
				}

				.xray-status-card-full {
					grid-column: 1 / -1;
				}

				.xray-status-label {
					font-size: 11px;
					text-transform: uppercase;
					letter-spacing: .06em;
					color: var(--xray-card-label);
					margin-bottom: 8px;
				}

				.xray-status-value {
					font-size: 15px;
					line-height: 1.65;
					font-weight: 500;
					color: var(--xray-card-text);
				}

				.xray-break {
					word-break: break-word;
					overflow-wrap: anywhere;
				}

				.xray-type-strx {
					color: var(--xray-type-strx-color);
					font-weight: 700;
				}

				.xray-type-stock {
					color: var(--xray-type-stock-color);
					font-weight: 700;
				}

				.xray-type-unknown {
					font-weight: 700;
				}

				.xray-latest-build {
					color: var(--xray-latest-color);
					font-weight: 700;
				}

				.xray-select-wrap {
					margin-top: 6px;
					margin-bottom: 14px;
				}

				.xray-select-label {
					display: block;
					margin-bottom: 8px;
					font-weight: 600;
					color: var(--xray-title-text);
				}

				.xray-select,
				.xray-select option {
					background: var(--xray-select-bg) !important;
					color: var(--xray-select-text) !important;
				}

				.xray-select {
					width: 100%;
					height: 46px;
					border-radius: 6px;
					box-sizing: border-box;
					border: 1px solid var(--xray-select-border) !important;
					box-shadow: none !important;
					font-weight: 600;
					-webkit-text-fill-color: var(--xray-select-text);
					opacity: 1 !important;
				}

				.xray-button-row {
					display: flex;
					flex-wrap: wrap;
					gap: 12px;
					align-items: center;
					justify-content: flex-end;
				}

				.xray-button-row .cbi-button {
					width: auto;
					min-width: 140px;
					height: 42px;
					padding: 0 18px;
					border: none;
					border-radius: 6px;
					font-weight: 700;
					box-shadow: 0 8px 18px rgba(0,0,0,0.10);
				}

				.xray-button-install {
					background: linear-gradient(180deg, #7280f6 0%, #5f6eea 100%);
					color: #fff;
				}

				.xray-button-rollback {
					background: linear-gradient(180deg, #93b12f 0%, #7d9927 100%);
					color: #fff;
				}

				.xray-button-reload {
					background: linear-gradient(180deg, #ffb51c 0%, #ffa30d 100%);
					color: #fff;
				}

				@media (max-width: 900px) {
					.xray-status-grid {
						grid-template-columns: repeat(2, minmax(0, 1fr));
						gap: 10px;
					}
				}

				@media (max-width: 700px) {
					.xray-section {
						padding: 14px;
						border-radius: 6px;
					}

					.xray-section-title {
						padding: 12px 14px;
					}

					.xray-status-grid {
						grid-template-columns: repeat(2, minmax(0, 1fr));
						gap: 10px;
					}

					.xray-status-card {
						padding: 12px 13px;
						border-radius: 6px;
					}

					.xray-status-value {
						font-size: 14px;
					}

					.xray-button-row {
						display: grid;
						grid-template-columns: repeat(3, minmax(0, 1fr));
						gap: 10px;
						justify-content: initial;
					}

					.xray-button-row .cbi-button {
						width: 100%;
						min-width: 0;
						font-size: 14px;
						padding: 0 8px;
						height: 44px;
					}

					.xray-select {
						height: 44px;
						font-size: 16px;
					}
				}
			`]),

			E('h2', {}, [ _('Project X') ]),
			E('div', { 'class': 'cbi-map-descr' }, [
				'Credit to: DotyCat • Project X • STRX'
			]),

			E('div', { 'class': 'xray-section' }, [
				E('h3', { 'class': 'xray-section-title' }, [ _('Install') ]),

				E('div', {
					'id': 'xray-log-wrap',
					'style': 'display:none;margin:0 0 14px 0;'
				}, [
					E('pre', {
						'id': 'xray-log',
						'class': 'xray-log-box'
					}, [ '' ])
				]),

				E('div', { 'id': 'xray-status-box' }),

				E('div', { 'class': 'xray-select-wrap' }, [
					E('label', {
						'class': 'xray-select-label',
						'for': 'xray-version-select'
					}, [ _('Select version to install') ]),
					E('select', {
						'id': 'xray-version-select',
						'class': 'cbi-input-select xray-select'
					})
				]),

				E('div', { 'class': 'xray-button-row' }, [
					E('button', {
						'class': 'cbi-button xray-button-install',
						'click': ui.createHandlerFn(this, 'handleInstall')
					}, [ _('Install') ]),
					E('button', {
						'class': 'cbi-button xray-button-rollback',
						'click': ui.createHandlerFn(this, 'handleRollback')
					}, [ _('Rollback') ]),
					E('button', {
						'class': 'cbi-button xray-button-reload',
						'click': ui.createHandlerFn(this, 'handleReload')
					}, [ _('Reload') ])
				])
			])
		]);

		window.setTimeout(function() {
			self.logWrap = document.getElementById('xray-log-wrap');
			self.logBox = document.getElementById('xray-log');
			self.statusBox = document.getElementById('xray-status-box');
			self.versionSelectEl = document.getElementById('xray-version-select');

			self.updateStatusBox(status, versionRaw);
			self.updateVersionSelect(versions);
			self.applyThemeColors();
			self.startThemeWatcher();
		}, 0);

		return root;
	}
});
