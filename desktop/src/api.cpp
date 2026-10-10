#include "api.h"
#include <windows.h>
#include <winhttp.h>
#include <utility>
#include <stdexcept>

namespace ktga {
class Handle {
    HINTERNET value;
public:
    explicit Handle(HINTERNET handle) : value(handle) {}
    ~Handle() { if (value) WinHttpCloseHandle(value); }
    Handle(const Handle&) = delete; Handle& operator=(const Handle&) = delete;
    operator HINTERNET() const { return value; }
    explicit operator bool() const { return value != nullptr; }
};
Api::Api(std::wstring endpoint) : base(std::move(endpoint)) { if (!validServer(base)) throw std::invalid_argument("Untrusted API endpoint"); }
Response Api::request(const std::wstring& route, const std::wstring& method, const Json& body, const std::string& token, std::stop_token stop) const {
    Response result;
    if (!route.starts_with(L"/api/") || route.find_first_of(L"\r\n#") != std::wstring::npos || token.find_first_of("\r\n") != std::string::npos) { result.error = L"Requête invalide."; return result; }
    URL_COMPONENTS parts{}; parts.dwStructSize = sizeof(parts); parts.dwHostNameLength = static_cast<DWORD>(-1);
    if (!WinHttpCrackUrl(base.c_str(), 0, 0, &parts)) { result.error = L"Adresse API invalide."; return result; }
    std::wstring host(parts.lpszHostName, parts.dwHostNameLength);
    Handle session(WinHttpOpen(L"KTGAConsole/0.1.0", host == L"127.0.0.1" ? WINHTTP_ACCESS_TYPE_NO_PROXY : WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
    if (!session) { result.error = L"Le service réseau Windows n'est pas disponible."; return result; }
    WinHttpSetTimeouts(session, 5000, 5000, 5000, 8000);
    Handle connection(WinHttpConnect(session, host.c_str(), parts.nPort, 0));
    Handle request(connection ? WinHttpOpenRequest(connection, method.c_str(), route.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, parts.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0) : nullptr);
    if (!request) { result.error = L"Connexion impossible."; return result; }
    DWORD policy = WINHTTP_OPTION_REDIRECT_POLICY_NEVER; WinHttpSetOption(request, WINHTTP_OPTION_REDIRECT_POLICY, &policy, sizeof(policy));
    DWORD disabled = WINHTTP_DISABLE_COOKIES; WinHttpSetOption(request, WINHTTP_OPTION_DISABLE_FEATURE, &disabled, sizeof(disabled));
    std::wstring headers = L"Content-Type: application/json\r\nAccept: application/json\r\n";
    if (host != L"127.0.0.1") headers += L"Origin: https://www.ktga.me\r\n";
    if (!token.empty()) headers += L"Authorization: Bearer " + wide(token) + L"\r\n";
    std::string payload = body.is_null() ? "" : body.dump();
    if (stop.stop_requested()) { clearSecret(payload); return result; }
    const bool sent = WinHttpSendRequest(request, headers.c_str(), static_cast<DWORD>(headers.size()), payload.empty() ? WINHTTP_NO_REQUEST_DATA : payload.data(), static_cast<DWORD>(payload.size()), static_cast<DWORD>(payload.size()), 0);
    clearSecret(payload); if (!headers.empty()) SecureZeroMemory(headers.data(), headers.size() * sizeof(wchar_t));
    if (!sent || !WinHttpReceiveResponse(request, nullptr)) { result.error = L"Serveur injoignable ou connexion TLS refusée. Réessaie."; return result; }
    DWORD status = 0, size = sizeof(status); WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr, &status, &size, nullptr); result.status = static_cast<int>(status);
    if (status >= 300 && status < 400) { result.error = L"Redirection refusée pour protéger la session."; return result; }
    std::string content;
    while (!stop.stop_requested()) {
        char buffer[16384]; DWORD bytes = 0;
        if (!WinHttpReadData(request, buffer, sizeof(buffer), &bytes)) { result.error = L"La connexion a été interrompue."; return result; }
        if (!bytes) break;
        if (content.size() + bytes > 12 * 1024 * 1024) { result.error = L"Réponse serveur trop volumineuse."; return result; }
        content.append(buffer, bytes);
    }
    if (stop.stop_requested()) { clearSecret(content); result.error = L"Requête annulée."; return result; }
    try { result.data = Json::parse(content); } catch (...) { result.error = L"Réponse serveur invalide."; }
    clearSecret(content);
    if (result.status >= 400 && result.error.empty()) result.error = text(result.data, "error", L"La requête a été refusée.");
    return result;
}
}
