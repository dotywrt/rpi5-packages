uci = luci.model.uci.cursor()

m = Map("qmodem_ttl", translate("TTL / Hop Limit Config"))

s = m:section(NamedSection, "main", "main", translate("Global Config"))

enable = s:option(Flag, "enable", translate("Enable"))
enable.default = "0"

meta = s:option(ListValue, "meta_mode", translate("Apply Mode"))
meta:value("global", "Global (Recommended)")
meta:value("global2", "Global 2 (Recommended)")
meta:value("lan", "LAN Only (Experimental)")
meta:value("wwan_only", "WWAN Only (Experimental)") 
meta.default = "global"

ttl4 = s:option(Value, "ttl4", translate("IPv4 TTL"))
ttl4.default = 64
ttl4.datatype = "uinteger"

hl6 = s:option(Value, "hl6", translate("IPv6 Hop Limit"))
hl6.default = 64
hl6.datatype = "uinteger"

note = s:option(DummyValue, "_note", translate("Notice"))
note.rawhtml  = true
note.default = [[
<b>Note:</b> After applying TTL / Hop Limit, the following modules may be disabled temporarily to ensure proper TTL rewriting:
<ul>
  <li>ECM fastpath (/sys/kernel/debug/ecm/)</li>
  <li>Shortcut FE CM module</li>
  <li>Fast Classifier module</li>
</ul>
Firewall will also be restarted automatically.
]]

credit = s:option(DummyValue, "_credit", translate("Credit"))
credit.rawhtml = true
credit.default = [[
<small>Modded by <a href="https://dotycat.com" target="_blank">dotycat.com</a></small>
]]

return m