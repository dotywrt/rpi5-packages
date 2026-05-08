include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-xraycustom
PKG_VERSION:=1.0
PKG_RELEASE:=2

LUCI_DESCRIPTION:=LuCI application to manage and install custom Xray core with version control and rollback support.

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI Xray Custom Installer
  DEPENDS:=+luci-base +rpcd +wget-ssl +ca-bundle
  PKGARCH:=all
endef

define Package/$(PKG_NAME)/description
  $(LUCI_DESCRIPTION)
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(CP) ./root/* $(1)/
endef

$(eval $(call BuildPackage,$(PKG_NAME)))