#pragma once
#include <string>

namespace ktga {
std::string rememberedSession(const std::wstring& endpoint);
bool rememberSession(const std::wstring& endpoint, const std::string& token);
bool forgetSession(const std::wstring& endpoint);
}
