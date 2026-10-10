#pragma once
#include "model.h"
#include <stop_token>

namespace ktga {
struct Response { int status = 0; Json data = Json::object(); std::wstring error; };
class Api {
    std::wstring base;
public:
    explicit Api(std::wstring endpoint);
    Response request(const std::wstring& route, const std::wstring& method = L"GET", const Json& body = Json(), const std::string& token = {}, std::stop_token stop = {}) const;
};
}
