module("luci.controller.modeminfo", package.seeall)

function index()
	entry({"admin", "modem"}, firstchild(), _("Modem"), 40).dependent = false
	entry({"admin", "modem", "modeminfo"}, call("action_modeminfo"), _("Modem Info"), 20).dependent = false
	entry({"admin", "modem", "modeminfo", "get_info"}, call("get_modem_info")).dependent = false
	entry({"admin", "modem", "modeminfo", "set_refresh"}, call("set_refresh")).dependent = false
	entry({"admin", "modem", "modeminfo", "get_ports_info"}, call("get_ports_info")).dependent = false
	entry({"admin", "modem", "modeminfo", "save_port"}, call("save_port")).dependent = false
end

local function read_modeminfo_file()
	local modeminfo = {}
	local file = io.open("/tmp/modeminfo", "r")

	if file then
		for line in file:lines() do
			local key, value = line:match("^(.-):%s*(.*)$")
			if key and value then
				modeminfo[key] = value
			end
		end
		file:close()
	end

	return modeminfo
end

local function safe_run_modeminfo()
	luci.sys.call("/bin/sh /usr/bin/modeminfo >/dev/null 2>&1")
end

local function valid_refresh_rate(rate)
	local allowed = {
		["2"] = true,
		["5"] = true,
		["7"] = true,
		["10"] = true,
		["15"] = true
	}
	return allowed[tostring(rate or "")] == true
end

local function valid_comm_port(port)
	if not port then
		return false
	end

	if port:match("^/dev/ttyUSB%d+$") or port:match("^/dev/ttyACM%d+$") then
		return true
	end

	return false
end

function action_modeminfo()
	local uci = require "luci.model.uci".cursor()

	safe_run_modeminfo()

	local refresh_rate = uci:get("modeminfo", "settings", "refresh_rate") or "5"
	if not valid_refresh_rate(refresh_rate) then
		refresh_rate = "5"
	end

	local saved_comm = uci:get("modeminfo", "settings", "comm") or "/dev/ttyUSB3"

	luci.template.render("modeminfo", {
		modeminfo = read_modeminfo_file(),
		refresh_rate = refresh_rate,
		saved_comm = saved_comm
	})
end

function get_ports_info()
	local fs = require "nixio.fs"
	local uci = require "luci.model.uci".cursor()
	local available_ports = {}

	for file in fs.dir("/dev") do
		if file:match("^ttyUSB%d+$") or file:match("^ttyACM%d+$") then
			available_ports[#available_ports + 1] = "/dev/" .. file
		end
	end

	table.sort(available_ports)

	local saved_comm = uci:get("modeminfo", "settings", "comm") or "/dev/ttyUSB3"

	luci.http.prepare_content("application/json")
	luci.http.write_json({
		ports = available_ports,
		default_port = saved_comm
	})
end

function save_port()
	local uci = require "luci.model.uci".cursor()
	local http = require "luci.http"

	local selected_port = http.formvalue("commport")

	if selected_port and valid_comm_port(selected_port) then
		if not uci:get("modeminfo", "settings") then
			uci:section("modeminfo", "settings", "settings")
		end

		uci:set("modeminfo", "settings", "comm", selected_port)
		uci:commit("modeminfo")

		safe_run_modeminfo()
	end

	http.redirect(luci.dispatcher.build_url("admin/modem/modeminfo"))
end

function set_refresh()
	local uci = require "luci.model.uci".cursor()
	local http = require "luci.http"

	local refresh_rate = http.formvalue("refresh_rate")

	if valid_refresh_rate(refresh_rate) then
		if not uci:get("modeminfo", "settings") then
			uci:section("modeminfo", "settings", "settings")
		end

		uci:set("modeminfo", "settings", "refresh_rate", refresh_rate)
		uci:commit("modeminfo")
	end

	http.redirect(luci.dispatcher.build_url("admin/modem/modeminfo"))
end

function get_modem_info()
	safe_run_modeminfo()

	luci.http.prepare_content("application/json")
	luci.http.write_json(read_modeminfo_file())
end
