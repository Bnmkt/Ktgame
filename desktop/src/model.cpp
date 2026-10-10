#include "model.h"
#include <windows.h>
#include <winhttp.h>
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace ktga {
std::wstring wide(const std::string& value) {
    if (value.empty()) return {};
    int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
    if (!size) return L"Texte indisponible";
    std::wstring result(size, 0); MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), result.data(), size); return result;
}
std::string utf8(const std::wstring& value) {
    if (value.empty()) return {};
    int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    std::string result(size, 0); WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), result.data(), size, nullptr, nullptr); return result;
}
Json child(const Json& value, const std::string& key) { return value.is_object() && value.contains(key) ? value.at(key) : Json::object(); }
double numeric(const Json& row, const std::string& key, double fallback) { auto value = child(row, key); return value.is_number() && std::isfinite(value.get<double>()) ? value.get<double>() : fallback; }
std::wstring text(const Json& row, const std::string& key, const std::wstring& fallback) { auto value = child(row, key); return value.is_string() ? wide(value.get<std::string>()) : fallback; }
std::wstring formatNumber(double value, int precision) { std::wostringstream out; out << std::fixed << std::setprecision(precision) << value; auto result = out.str(); std::replace(result.begin(), result.end(), L'.', L','); return result; }
std::wstring formatBytes(double value) { static const wchar_t* units[] = { L"o", L"Ko", L"Mo", L"Go" }; int index = 0; while (value >= 1024 && index < 3) { value /= 1024; ++index; } return formatNumber(value, index ? 1 : 0) + L" " + units[index]; }
std::wstring formatTime(const std::wstring& iso) {
    if (iso.size() < 19) return iso.empty() ? L"-" : iso;
    SYSTEMTIME utc{}, local{};
    try { utc.wYear = static_cast<WORD>(std::stoi(iso.substr(0,4))); utc.wMonth = static_cast<WORD>(std::stoi(iso.substr(5,2))); utc.wDay = static_cast<WORD>(std::stoi(iso.substr(8,2))); utc.wHour = static_cast<WORD>(std::stoi(iso.substr(11,2))); utc.wMinute = static_cast<WORD>(std::stoi(iso.substr(14,2))); }
    catch (...) { return iso; }
    if (!SystemTimeToTzSpecificLocalTime(nullptr, &utc, &local)) return iso;
    wchar_t value[48]{}; swprintf_s(value, L"%02u/%02u/%04u %02u:%02u", local.wDay, local.wMonth, local.wYear, local.wHour, local.wMinute); return value;
}
std::wstring statusLabel(const std::wstring& status) {
    if (status == L"operational" || status == L"healthy") return L"Opérationnel";
    if (status == L"degraded" || status == L"warning") return L"À surveiller";
    if (status == L"outage") return L"Indisponible";
    if (status == L"completed" || status == L"closed") return L"Terminé";
    if (status == L"in_progress") return L"En cours";
    if (status == L"scheduled") return L"Prévu";
    return L"Sans données";
}
std::vector<std::wstring> wrapText(const std::wstring& value, std::size_t columns) {
    std::vector<std::wstring> lines; std::wstring current; std::wistringstream input(value); std::wstring word;
    while (input >> word) { if (!current.empty() && current.size() + word.size() + 1 > columns) { lines.push_back(current); current.clear(); } if (!current.empty()) current += L" "; current += word; }
    if (!current.empty()) lines.push_back(current); return lines;
}
bool validServer(const std::wstring& value) {
    if (value == L"https://api.ktga.me") return true;
    const std::wstring prefix = L"http://127.0.0.1:";
    if (!value.starts_with(prefix)) return false;
    const auto port = value.substr(prefix.size());
    if (port.empty() || port.size() > 5 || port.find_first_not_of(L"0123456789") != std::wstring::npos) return false;
    const auto number = std::stoi(port); return number >= 1024 && number <= 65535 && number != 4000;
}
void clearSecret(std::string& value) { if (!value.empty()) SecureZeroMemory(value.data(), value.size()); value.clear(); }
int selfTest() {
    if (!validServer(L"https://api.ktga.me") || !validServer(L"http://127.0.0.1:4106")) return 1;
    for (const auto* value : { L"http://api.ktga.me", L"https://evil.test", L"http://127.0.0.1:4000", L"https://api.ktga.me/private", L"http://127.0.0.1:1234?token=x" }) if (validServer(value)) return 2;
    Json object = { {"number", 12}, {"nil", nullptr}, {"string", "État"} };
    if (numeric(object, "number") != 12 || numeric(object, "nil", 7) != 7 || text(object,"string") != L"État" || wide(utf8(L"Dés et maîtrises")) != L"Dés et maîtrises") return 3;
    if (formatBytes(1048576) != L"1,0 Mo" || wrapText(L"Un test complet", 8).size() != 2) return 4;
    std::string secret = "sensitive"; clearSecret(secret); if (!secret.empty()) return 5;
    return 0;
}
}
