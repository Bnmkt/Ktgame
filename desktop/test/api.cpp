#include "../src/api.h"
#include <iostream>
int wmain(int argc,wchar_t** argv) {
    if(argc==2 && std::wstring(argv[1])==L"--public-check") {
        ktga::Api api(L"https://api.ktga.me");
        auto result=api.request(L"/api/health");
        std::cout << "Public HTTPS health: " << result.status << " " << ktga::utf8(result.error) << std::endl;
        if(result.status!=200 || !result.error.empty()) return 4;
        auto denied=api.request(L"/api/desktop/overview");
        std::cout << "Unauthenticated supervision: " << denied.status << std::endl;
        return denied.status==401?0:5;
    }
    if(argc!=2 || !std::wstring(argv[1]).starts_with(L"http://127.0.0.1:")) return 1;
    ktga::Api api(argv[1]);
    auto result=api.request(L"/api/auth/login",L"POST",{{"login","editor@example.test"},{"password","FixturePassword!"}});
    std::cout << "Login: " << result.status << " " << ktga::utf8(result.error) << std::endl;
    if(result.status!=200 || !result.error.empty()) return 2;
    auto token=result.data.value("token",std::string());
    for(auto route:{L"/api/desktop/overview",L"/api/desktop/metrics",L"/api/desktop/status"}) {
        auto data=api.request(route,L"GET",ktga::Json(),token);
        std::cout << ktga::utf8(route) << ": " << data.status << " " << ktga::utf8(data.error) << std::endl;
        if(data.status!=200 || !data.error.empty()) return 3;
    }
    ktga::clearSecret(token);return 0;
}
