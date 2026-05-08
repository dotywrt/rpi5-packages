'use strict';
'require baseclass';
'require fs';

let prev = {};
let last_time = Date.now();
let ipVisible = localStorage.getItem('ipVisible') !== 'false';
let currentIface = '';
let widgetEnabled = true;

if (!window.arwiNetstatState) {
	window.arwiNetstatState = {
		cpuLast: null,
		cpuText: '-',
		ramText: '-',
		tempText: '-',
		netStatus: '0',
		netClass: 'OFFLINE'
	};
}

function checkWidgetStatus() {
	return fs.exec('/sbin/uci', ['get', 'netstats.@config[0].show_status'])
		.then(res => {
			const val = res.stdout.trim();
			widgetEnabled = (val === '1');
			return widgetEnabled;
		})
		.catch(() => {
			widgetEnabled = true;
			return true;
		});
}

(function loadDynamicCSS() {
	function isDarkMode() {
		try {
			const bgColor = getComputedStyle(document.body).backgroundColor;
			if (!bgColor) return false;
			const rgb = bgColor.match(/\d+/g);
			if (!rgb) return false;
			const [r, g, b] = rgb.map(Number);
			return (r * 299 + g * 587 + b * 114) / 1000 < 100;
		} catch (e) {
			console.error('Error detecting dark mode:', e);
			return false;
		}
	}

	try {
		const dark = isDarkMode();
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = dark
			? '/luci-static/resources/netstat/netstat_dark.css'
			: '/luci-static/resources/netstat/netstat.css';
		document.head.appendChild(link);
	} catch (e) {
		console.error('Error loading CSS:', e);
	}
})();

function parseStats(raw) {
	try {
		const lines = raw.trim().split('\n');
		const stats = {};
		lines.forEach(line => {
			const parts = line.trim().split(':');
			if (parts.length < 2) return;
			const iface = parts[0].trim();
			const values = parts[1].trim().split(/\s+/);
			stats[iface] = {
				rx: parseInt(values[0]) || 0,
				tx: parseInt(values[8]) || 0
			};
		});
		return stats;
	} catch (e) {
		console.error('parseStats error:', e);
		return {};
	}
}

function fetchJson(url) {
	return fs.exec('/usr/bin/curl', ['-sL', '--connect-timeout', '2', '--max-time', '3', url])
		.catch(() => fs.exec('/bin/uclient-fetch', ['-qO-', url]));
}

function getLatency(host) {
	return fs.exec('/bin/ping', ['-c', '1', '-W', '1', host])
		.then(res => {
			const out = res.stdout || '';
			const match = out.match(/time[=<]([\d.]+)/);
			return match ? `${Math.round(parseFloat(match[1]))}ms` : 'N/A';
		})
		.catch(() => 'N/A');
}

function getPublicIP() {
	return fetchJson('https://ip.guide')
		.then(async res => {
			try {
				const json = JSON.parse(res.stdout);
				const data = json.ip_response || json;
				const latency = await getLatency('8.8.8.8');

				return {
					ip: data.ip || 'Unavailable',
					latency: latency,
					network: {
						autonomous_system: {
							name:
								data.network?.autonomous_system?.organization ||
								data.network?.autonomous_system?.name ||
								'Unknown'
						}
					}
				};
			} catch {
				return {
					ip: 'Unavailable',
					latency: 'N/A',
					network: { autonomous_system: { name: 'Unknown' } }
				};
			}
		})
		.catch(() => ({
			ip: 'Unavailable',
			latency: 'N/A',
			network: { autonomous_system: { name: 'Unknown' } }
		}));
}

function getPreferredInterfaces() {
	return fs.exec('/sbin/uci', ['get', 'netstats.@config[0].prefer'])
		.then(res => res.stdout.trim().split(/\s+/).filter(Boolean))
		.catch(() => []);
}

async function getMode() {
	try {
		const backendRes = await fs.exec('/sbin/uci', ['get', 'netstats.@config[0].backend']);
		const backend = backendRes.stdout.trim().toLowerCase();
		if (backend !== 'vnstat') return '';

		const modeRes = await fs.exec('/sbin/uci', ['get', 'netstats.@config[0].mode']);
		const val = modeRes.stdout.trim().toLowerCase();
		return (val === 'daily' || val === 'monthly') ? val : 'daily';
	} catch {
		return '';
	}
}

function getBackend() {
	return fs.exec('/sbin/uci', ['get', 'netstats.@config[0].backend'])
		.then(res => {
			const val = res.stdout.trim().toLowerCase();
			return (val === 'vnstat') ? 'vnstat' : 'normal';
		})
		.catch(() => 'normal');
}

function getBestWAN(stats, preferred) {
	for (const iface of preferred) {
		if (stats[iface]) return iface;
	}

	const dynamic = Object.keys(stats).find(i =>
		/^(wwan|usb|ppp|lte|qmi|modem)/.test(i) && i.includes('_')
	);
	if (dynamic) return dynamic;

	const fallback = ['pppoe-wan', 'lte0', 'usb0', 'wan', 'eth1', 'tun0', 'wg0'];
	for (const iface of fallback) {
		if (stats[iface]) return iface;
	}

	const nonLo = Object.keys(stats).filter(k => k !== 'lo');
	return nonLo[0] || 'wwan0_1';
}

function formatRate(bits) {
	const units = ['Bps', 'Kbps', 'Mbps', 'Gbps'];
	let i = 0;
	while (bits >= 1000 && i < units.length - 1) {
		bits /= 1000;
		i++;
	}
	return { number: bits.toFixed(i > 0 ? 1 : 0), unit: units[i] + '/s' };
}

function formatSize(bytes) {
	const units = ['B', 'KB', 'MB', 'GB'];
	let i = 0;
	while (bytes >= 1024 && i < units.length - 1) {
		bytes /= 1024;
		i++;
	}
	return { number: bytes.toFixed(i > 0 ? 1 : 0), unit: units[i] };
}

function createStatCard(label, valueNum, valueUnit, color, iface) {
	return E('div', { class: 'stats-card', style: 'box-shadow: none;' }, [
		E('div', { class: 'stat-label' }, label),
		E('div', { class: 'stat-value' }, [
			E('span', { class: 'stat-number' }, valueNum),
			E('br'),
			E('span', { class: 'stat-unit' }, valueUnit)
		]),
		E('span', {
			class: 'iface-badge',
			style: `margin-top: 6px; display: inline-block; padding: 2px 6px; font-size: 10px; border-radius: 4px; background-color: ${color}; color: white;`
		}, iface)
	]);
}

function createTrafficCard(label, speedNum, speedUnit, totalNum, totalUnit, color) {
	return E('div', { class: 'stats-card', style: 'box-shadow: none;' }, [
		E('div', { class: 'stat-label' }, label),

		E('div', { class: 'stat-value' }, [
			E('span', { class: 'stat-number' }, speedNum),
			E('br'),
			E('span', { class: 'stat-unit' }, speedUnit)
		]),

		E('span', {
			class: 'iface-badge',
			style: `margin-top: 6px; display: inline-block; padding: 2px 6px; font-size: 10px; border-radius: 4px; background-color: ${color}; color: white;`
		}, totalNum + totalUnit)
	]);
}

function createCpuRamCard(cpuText, ramText) {
	return E('div', { class: 'stats-card', style: 'box-shadow: none;' }, [
		E('div', { class: 'stat-label' }, _('CPU / RAM')),
		E('div', { class: 'stat-value' }, [
			E('span', { class: 'stat-number' }, cpuText.replace('%', '') + '%'),
			E('br'),
			E('span', { class: 'stat-unit' }, 'RAM ' + ramText)
		]),
		E('span', {
			class: 'iface-badge',
			style: 'margin-top: 6px; display: inline-block; padding: 2px 6px; font-size: 10px; border-radius: 4px; background-color: #673AB7; color: white;'
		}, 'SYSTEM')
	]);
}

function createIPCard(ip, org, latency) {
	const ipVal = E('div', { class: 'ip-value', id: 'ip-value' }, ipVisible ? ip : '**********');
	const eyeIcon = E('img', {
		src: ipVisible
			? '/luci-static/resources/netstat/eye-outline.svg'
			: '/luci-static/resources/netstat/eye-off-outline.svg',
		width: 18,
		height: 18,
		style: 'vertical-align: middle;'
	});
	const eye = E('span', {
		class: 'eye-icon',
		title: _('Show/Hide IP'),
		style: 'cursor: pointer; vertical-align: middle; margin-left: 6px;'
	}, [eyeIcon]);

	eye.addEventListener('click', function () {
		ipVisible = !ipVisible;
		localStorage.setItem('ipVisible', ipVisible);
		ipVal.textContent = ipVisible ? ip : '**********';
		eyeIcon.src = ipVisible
			? '/luci-static/resources/netstat/eye-outline.svg'
			: '/luci-static/resources/netstat/eye-off-outline.svg';
	});

	return E('div', { class: 'ip-card full-width', style: 'box-shadow: none;' }, [
		E('div', {
			class: 'ip-org',
			style: `margin-bottom: 4px; color:${latency !== 'N/A' ? '#4CAF50' : '#F44336'}; font-weight: 600;`
		}, latency || 'N/A'),
		E('div', { class: 'ip-line' }, [ipVal, eye]),
		E('div', { class: 'ip-org' }, org),
		E('div', { class: 'bubble yellow' })
	]);
}

return baseclass.extend({
	title: _('NetStat'),

	load: function () {
		return checkWidgetStatus().then(shouldShow => {
			if (!shouldShow) {
				return Promise.resolve({ hideWidget: true });
			}

			return Promise.all([
				fs.read_direct('/proc/net/dev').then(parseStats).catch(() => ({})),
				getPublicIP(),
				getPreferredInterfaces(),
				getMode(),
				getBackend(),
				fs.read('/proc/stat').catch(() => null),
				fs.read('/sys/class/thermal/thermal_zone0/temp').catch(() => null),
				fs.read('/proc/meminfo').catch(() => null),
				fs.exec('/bin/ping', ['-c', '1', '-W', '1', '8.8.8.8']).catch(() => null)
			]).then(async ([netStats, ipData, preferred, mode, backend, procStat, tempRaw, memInfo, pingRes]) => {
				const iface = getBestWAN(netStats, preferred);
				let vnstatRx = 0, vnstatTx = 0;

				if (backend === 'vnstat') {
					try {
						const res = await fs.exec('/usr/bin/vnstat', ['-i', iface, '--json']);
						const json = JSON.parse(res.stdout);
						const key = mode === 'daily' ? 'days' : (mode === 'monthly' ? 'months' : 'days');
						const trafficArr = json.interfaces?.[0]?.traffic?.[key];

						if (Array.isArray(trafficArr) && trafficArr.length > 0) {
							const today = new Date();
							let matchEntry;

							if (mode === 'monthly') {
								matchEntry = trafficArr.find(e =>
									e.date &&
									e.date.year === today.getFullYear() &&
									e.date.month === today.getMonth() + 1
								);
							} else {
								matchEntry = trafficArr.find(e =>
									e.date &&
									e.date.year === today.getFullYear() &&
									e.date.month === today.getMonth() + 1 &&
									e.date.day === today.getDate()
								);
							}

							if (matchEntry) {
								vnstatRx = matchEntry.rx * 1024;
								vnstatTx = matchEntry.tx * 1024;
							} else {
								const lastEntry = trafficArr[trafficArr.length - 1];
								if (lastEntry) {
									vnstatRx = lastEntry.rx * 1024;
									vnstatTx = lastEntry.tx * 1024;
								} else {
									const total = json.interfaces?.[0]?.traffic?.total;
									if (total) {
										vnstatRx = total.rx * 1024;
										vnstatTx = total.tx * 1024;
									}
								}
							}
						} else {
							const total = json.interfaces?.[0]?.traffic?.total;
							if (total) {
								vnstatRx = total.rx * 1024;
								vnstatTx = total.tx * 1024;
							}
						}
					} catch (e) {
						console.warn('vnstat error:', e);
					}
				} else {
					vnstatRx = netStats[iface]?.rx || 0;
					vnstatTx = netStats[iface]?.tx || 0;
				}

				return {
					netStats,
					ipData,
					preferred,
					vnstatRx,
					vnstatTx,
					mode,
					backend,
					procStat,
					tempRaw,
					memInfo,
					pingRes,
					hideWidget: false
				};
			});
		});
	},

	render: function (data) {
		if (data.hideWidget) {
			return E('div', { style: 'display: none;' });
		}

		const state = window.arwiNetstatState;

		const now = Date.now();
		const dt = Math.max(0.1, (now - last_time) / 1000);
		last_time = now;

		const stats = Object.fromEntries(
			Object.entries(data.netStats).filter(([k]) => !['lo', 'br-lan', 'docker0'].includes(k))
		);

		const iface = getBestWAN(stats, data.preferred);
		const curr = stats[iface] || { rx: 0, tx: 0 };
		const prevStat = prev[iface] || curr;

		let rxSpeed = (curr.rx - prevStat.rx) / dt;
		let txSpeed = (curr.tx - prevStat.tx) / dt;

		prev[iface] = curr;

		const rxRate = formatRate(rxSpeed * 8);
		const txRate = formatRate(txSpeed * 8);

		const rxTotal = formatSize(data.backend === 'vnstat' ? data.vnstatRx : curr.rx);
		const txTotal = formatSize(data.backend === 'vnstat' ? data.vnstatTx : curr.tx);

		if (data.procStat) {
			const lines = String(data.procStat).trim().split('\n');
			const cpuLine = lines[0].replace(/\s+/g, ' ').split(' ');
			const total =
				parseInt(cpuLine[1]) + parseInt(cpuLine[2]) + parseInt(cpuLine[3]) +
				parseInt(cpuLine[4]) + parseInt(cpuLine[5]) + parseInt(cpuLine[6]) +
				parseInt(cpuLine[7]) + parseInt(cpuLine[8]);
			const active = total - parseInt(cpuLine[4]) - parseInt(cpuLine[5]);

			if (state.cpuLast && state.cpuLast.total > 0) {
				const diffTotal = total - state.cpuLast.total;
				const diffActive = active - state.cpuLast.active;
				let percent = 0;
				if (diffTotal > 0) percent = (diffActive / diffTotal) * 100;
				state.cpuText = Math.round(percent) + '%';
			}
			if (!state.cpuLast || total > state.cpuLast.total) {
				state.cpuLast = { total, active };
			}
		}

		if (data.memInfo) {
			const raw = String(data.memInfo);
			const memTotal = raw.match(/^MemTotal:\s+(\d+)/m);
			const memAvailable = raw.match(/^MemAvailable:\s+(\d+)/m);

			if (memTotal && memAvailable) {
				const total = parseInt(memTotal[1], 10);
				const available = parseInt(memAvailable[1], 10);
				const used = total - available;
				const ramPercent = (used / total) * 100;
				state.ramText = Math.round(ramPercent) + '%';
			}
		}

		if (data.tempRaw) {
			const tempC = parseInt(data.tempRaw, 10) / 1000;
			if (!isNaN(tempC)) {
				state.tempText = Math.round(tempC) + '°C';
			}
		}

		if (data.pingRes && data.pingRes.code === 0 && data.ipData?.latency && data.ipData.latency !== 'N/A') {
			state.netStatus = data.ipData.latency || '0ms';
			state.netClass = 'ONLINE';
		} else {
			state.netStatus = 'N/A';
			state.netClass = 'OFFLINE';
		}

		const grid = E('div', { class: 'stats-grid' });

		grid.appendChild(createTrafficCard(
			_('DOWNLOAD'),
			rxRate.number,
			rxRate.unit,
			rxTotal.number,
			rxTotal.unit,
			'#4CAF50'
		));

		grid.appendChild(createTrafficCard(
			_('UPLOAD'),
			txRate.number,
			txRate.unit,
			txTotal.number,
			txTotal.unit,
			'#2196F3'
		));

		grid.appendChild(createCpuRamCard(state.cpuText, state.ramText));
		grid.appendChild(createStatCard(_('TEMP'), state.tempText.replace('°C', ''), '°C', '#FF5722', 'temp'));

		grid.appendChild(createIPCard(
			data.ipData?.ip || 'Unavailable',
			data.ipData?.network?.autonomous_system?.name || 'Unknown',
			state.netStatus
		));

		let vnstatLastUpdate = 0;

		L.Poll.add(() => {
			const now = Date.now();
			if (now - vnstatLastUpdate > 120000) {
				vnstatLastUpdate = now;
				fs.exec('/usr/bin/vnstat', ['--update'])
					.catch(e => console.warn('vnstat update error:', e));
			}

			return Promise.all([
				fs.read_direct('/proc/net/dev').then(parseStats).catch(() => ({})),
				fs.read('/proc/stat').catch(() => null),
				fs.read('/sys/class/thermal/thermal_zone0/temp').catch(() => null),
				fs.read('/proc/meminfo').catch(() => null),
				fs.exec('/bin/ping', ['-c', '1', '-W', '1', '8.8.8.8']).catch(() => null),
				getPublicIP()
			]).then(([updated, procStat, tempRaw, memInfo, pingRes, ipData]) => {
				return this.render({
					netStats: updated,
					ipData: ipData,
					preferred: data.preferred,
					vnstatRx: data.vnstatRx,
					vnstatTx: data.vnstatTx,
					mode: data.mode,
					backend: data.backend,
					procStat,
					tempRaw,
					memInfo,
					pingRes,
					hideWidget: false
				});
			});

		}, 1000);

		return E('div', {}, [grid]);
	}
});