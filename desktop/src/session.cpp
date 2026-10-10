#include "session.h"
#include <windows.h>
#include <wincred.h>

namespace ktga {
namespace {
std::wstring target(const std::wstring& endpoint) { return L"KTGA Console/session/" + endpoint; }
}
std::string rememberedSession(const std::wstring& endpoint) {
    PCREDENTIALW credential = nullptr;
    if (!CredReadW(target(endpoint).c_str(), CRED_TYPE_GENERIC, 0, &credential)) return {};
    std::string token;
    if (credential->CredentialBlob && credential->CredentialBlobSize <= CRED_MAX_CREDENTIAL_BLOB_SIZE)
        token.assign(reinterpret_cast<const char*>(credential->CredentialBlob), credential->CredentialBlobSize);
    if (credential->CredentialBlob) SecureZeroMemory(credential->CredentialBlob, credential->CredentialBlobSize);
    CredFree(credential);
    return token;
}
bool rememberSession(const std::wstring& endpoint, const std::string& token) {
    if (token.empty() || token.size() > CRED_MAX_CREDENTIAL_BLOB_SIZE) return false;
    auto name = target(endpoint);
    CREDENTIALW credential{};
    credential.Type = CRED_TYPE_GENERIC;
    credential.TargetName = name.data();
    credential.CredentialBlobSize = static_cast<DWORD>(token.size());
    credential.CredentialBlob = reinterpret_cast<LPBYTE>(const_cast<char*>(token.data()));
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
    return CredWriteW(&credential, 0) != FALSE;
}
bool forgetSession(const std::wstring& endpoint) {
    return CredDeleteW(target(endpoint).c_str(), CRED_TYPE_GENERIC, 0) != FALSE || GetLastError() == ERROR_NOT_FOUND;
}
}
