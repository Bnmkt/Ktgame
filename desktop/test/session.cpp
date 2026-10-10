#include "session.h"
#include <windows.h>
#include <iostream>
#include <stdexcept>

int main() {
    const auto endpoint = L"test://ktga-" + std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64());
    const auto check = [](bool ok) { if (!ok) throw std::runtime_error("Session test failed"); };
    try {
        check(ktga::rememberedSession(endpoint).empty());
        check(ktga::forgetSession(endpoint));
        check(!ktga::rememberSession(endpoint, {}));
        check(!ktga::rememberSession(endpoint, std::string(10000, 'x')));
        check(ktga::rememberSession(endpoint, "test-session-one"));
        check(ktga::rememberedSession(endpoint) == "test-session-one");
        check(ktga::rememberedSession(endpoint + L"-other").empty());
        check(ktga::rememberSession(endpoint, "test-session-two"));
        check(ktga::rememberedSession(endpoint) == "test-session-two");
        check(ktga::forgetSession(endpoint));
        check(ktga::rememberedSession(endpoint).empty());
        check(ktga::forgetSession(endpoint));
        std::cout << "PASS: Windows credential persistence, API isolation, replacement and deletion.\n";
    } catch (...) { ktga::forgetSession(endpoint); return 1; }
    return 0;
}
