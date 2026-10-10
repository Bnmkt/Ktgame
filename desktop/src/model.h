#pragma once
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

namespace ktga {
using Json = nlohmann::json;
std::wstring wide(const std::string& value);
std::string utf8(const std::wstring& value);
double numeric(const Json& row, const std::string& key, double fallback = 0);
std::wstring text(const Json& row, const std::string& key, const std::wstring& fallback = L"-");
std::wstring formatNumber(double value, int precision = 0);
std::wstring formatBytes(double value);
std::wstring formatTime(const std::wstring& iso);
std::wstring statusLabel(const std::wstring& status);
std::vector<std::wstring> wrapText(const std::wstring& value, std::size_t columns);
Json child(const Json& value, const std::string& key);
bool validServer(const std::wstring& value);
void clearSecret(std::string& value);
int selfTest();
}
