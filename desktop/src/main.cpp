#include "api.h"
#include <windows.h>
#include <windowsx.h>
#include <commctrl.h>
#include <commdlg.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <functional>
#include <memory>
#include <thread>
#include <map>
#include <tuple>

using namespace ktga;
namespace {
constexpr UINT RESPONSE = WM_APP + 1;
constexpr COLORREF background = RGB(12, 19, 17), surface = RGB(21, 31, 28), border = RGB(49, 66, 58);
constexpr COLORREF ink = RGB(240, 235, 219), muted = RGB(158, 176, 165), gold = RGB(225, 187, 83), green = RGB(110, 211, 166), red = RGB(232, 126, 137), blue = RGB(116, 188, 236);
enum Id { Login = 100, Password, SignIn, ShowPassword, Code, Verify, Method, EmailCode, Back,
    Refresh = 200, Pause, Logout, Interval, Period, Export, Website,
    Overview = 300, Services, Metrics, Incidents, Preferences };
struct JobResult { unsigned epoch; std::wstring kind; Response response; Json extra; };
RECT rect(int x, int y, int w, int h) { return {x,y,x+w,y+h}; }
void fill(HDC dc, RECT area, COLORREF color) { auto brush = CreateSolidBrush(color); FillRect(dc, &area, brush); DeleteObject(brush); }
void frame(HDC dc, RECT area, COLORREF color) { auto brush = CreateSolidBrush(color); FrameRect(dc, &area, brush); DeleteObject(brush); }
void label(HDC dc, const std::wstring& value, RECT area, int size = 14, COLORREF color = ink, bool bold = false, UINT flags = DT_LEFT | DT_TOP | DT_END_ELLIPSIS | DT_NOPREFIX) {
    auto font = CreateFontW(-size, 0, 0, 0, bold ? FW_SEMIBOLD : FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
    auto prior = SelectObject(dc, font); SetTextColor(dc, color); SetBkMode(dc, TRANSPARENT); DrawTextW(dc, value.c_str(), -1, &area, flags); SelectObject(dc, prior); DeleteObject(font);
}
COLORREF severity(const std::wstring& value) { if (value == L"outage") return red; if (value == L"degraded" || value == L"warning") return gold; if (value == L"healthy" || value == L"operational") return green; return muted; }
std::wstring input(HWND window) { int size = GetWindowTextLengthW(window); std::wstring result(size + 1, 0); GetWindowTextW(window, result.data(), size + 1); result.resize(size); return result; }
std::filesystem::path settingsPath() {
    wchar_t directory[MAX_PATH]{};
    if (!GetEnvironmentVariableW(L"LOCALAPPDATA", directory, MAX_PATH)) return {};
    return std::filesystem::path(directory) / L"KTGA Console" / L"settings.json";
}
void detailWindow(HWND owner, const std::wstring& title, const std::wstring& message) {
    static HBRUSH brush=CreateSolidBrush(surface);
    WNDCLASSW type{}; type.hInstance=GetModuleHandleW(nullptr); type.lpszClassName=L"KtgaIncidentWindow"; type.hCursor=LoadCursorW(nullptr,IDC_ARROW);
    type.hbrBackground=brush;
    type.lpfnWndProc=[](HWND hwnd,UINT msg,WPARAM w,LPARAM l)->LRESULT {
        if(msg==WM_SIZE) { auto edit=GetDlgItem(hwnd,1); if(edit) MoveWindow(edit,16,16,std::max(20,LOWORD(l)-32),std::max(20,HIWORD(l)-32),TRUE); return 0; }
        if(msg==WM_CLOSE) { DestroyWindow(hwnd); return 0; }
        if(msg==WM_CTLCOLORSTATIC || msg==WM_CTLCOLOREDIT) { auto dc=reinterpret_cast<HDC>(w);SetTextColor(dc,ink);SetBkColor(dc,surface);return reinterpret_cast<LRESULT>(brush); }
        return DefWindowProcW(hwnd,msg,w,l);
    }; RegisterClassW(&type);
    auto window = CreateWindowExW(WS_EX_DLGMODALFRAME, type.lpszClassName, title.c_str(), WS_OVERLAPPEDWINDOW | WS_VISIBLE, CW_USEDEFAULT, CW_USEDEFAULT, 760, 580, owner, nullptr, type.hInstance, nullptr);
    auto edit = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", message.c_str(), WS_CHILD | WS_VISIBLE | ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL | WS_VSCROLL, 16, 16, 710, 510, window, reinterpret_cast<HMENU>(1), GetModuleHandleW(nullptr), nullptr);
    SendMessageW(edit, WM_SETFONT, reinterpret_cast<WPARAM>(GetStockObject(DEFAULT_GUI_FONT)), TRUE);
    BOOL dark=TRUE; DwmSetWindowAttribute(window,20,&dark,sizeof(dark));
}
class Console {
    HWND window = nullptr, tooltips = nullptr;
    std::map<int,HWND> controls;
    HFONT controlFont = nullptr;
    HBRUSH editBrush = CreateSolidBrush(RGB(29, 41, 35));
    Api api;
    std::jthread worker;
    unsigned epoch = 1;
    bool authenticated = false, mfa = false, busy = false, paused = false, preview = false;
    int width = 1260, height = 800, view = Overview, scroll = 0, extent = 0, refreshSeconds = 5, days = 30;
    float dpi = 1;
    std::string token;
    std::wstring login, challenge, account, role, message;
    Json snapshot = Json::object(), metrics = Json::object(), status = Json::object(), mfaMethods = Json::array();
    std::chrono::steady_clock::time_point nextPoll{}, nextSlow{}, retryAfter{};
    std::vector<std::pair<RECT,Json>> incidentAreas;
    std::wstring endpoint;
public:
    explicit Console(std::wstring server, const std::filesystem::path& fixture = {}) : api(server), endpoint(std::move(server)) {
        if (!fixture.empty()) {
            std::ifstream file(fixture); Json data; file >> data;
            snapshot = data.at("overview"); metrics = data.at("metrics"); status = data.at("status");
            authenticated = true; paused = true; preview = true;
            account = text(child(snapshot,"viewer"),"name",L"Aperçu"); role = text(child(snapshot,"viewer"),"role",L"editor");
        }
        try { auto path = settingsPath(); if (std::filesystem::exists(path)) { std::ifstream file(path); Json settings; file >> settings; auto interval = static_cast<int>(numeric(settings,"interval",5)); auto period = static_cast<int>(numeric(settings,"days",30)); if (interval == 5 || interval == 15 || interval == 30 || interval == 60) refreshSeconds = interval; if (period == 30 || period == 90 || period == 365) days = period; } } catch (...) {}
    }
    ~Console() { if (worker.joinable()) { worker.request_stop(); worker.join(); } clearSecret(token); if (controlFont) DeleteObject(controlFont); DeleteObject(editBrush); }
    int run(HINSTANCE instance, int show) {
        WNDCLASSW type{}; type.lpfnWndProc = proc; type.hInstance = instance; type.lpszClassName = L"KtgaConsoleWindow"; type.hCursor = LoadCursorW(nullptr, IDC_ARROW); type.hIcon = LoadIconW(nullptr, IDI_APPLICATION); RegisterClassW(&type);
        RECT work{}; SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
        const int initialW = std::min<int>(1320, work.right-work.left-48), initialH = std::min<int>(880, work.bottom-work.top-48);
        window = CreateWindowExW(0, type.lpszClassName, L"KTGA.ME - Console de supervision", WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN | WS_VSCROLL, work.left+(work.right-work.left-initialW)/2, work.top+(work.bottom-work.top-initialH)/2, initialW, initialH, nullptr, nullptr, instance, this);
        if (!window) return 1;
        BOOL dark = TRUE; DwmSetWindowAttribute(window, 20, &dark, sizeof(dark));
        ShowWindow(window, show); UpdateWindow(window); SetTimer(window, 1, 1000, nullptr);
        MSG msg{}; while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
            if(msg.message==WM_KEYDOWN && msg.wParam==VK_RETURN && !authenticated && !busy) { if(mfa) verify(); else signIn(); continue; }
            if (!IsDialogMessageW(window, &msg)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
        }
        return static_cast<int>(msg.wParam);
    }
private:
    int px(int value) const { return static_cast<int>(std::lround(value*dpi)); }
    HWND create(const wchar_t* type, const wchar_t* title, int id, DWORD style = 0) {
        auto child = CreateWindowExW(type == std::wstring(L"EDIT") ? WS_EX_CLIENTEDGE : 0, type, title, WS_CHILD | WS_TABSTOP | style, 0,0,0,0,window,reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)),GetModuleHandleW(nullptr),nullptr);
        controls[id] = child; SendMessageW(child,WM_SETFONT,reinterpret_cast<WPARAM>(controlFont),FALSE); return child;
    }
    void updateFont() {
        auto next=CreateFontW(-px(14),0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Segoe UI");
        for(const auto& [id,control]:controls) SendMessageW(control,WM_SETFONT,reinterpret_cast<WPARAM>(next),TRUE);
        if(controlFont) DeleteObject(controlFont); controlFont=next;
    }
    void initialize() {
        dpi = GetDpiForWindow(window)/96.0f; updateFont();
        create(L"EDIT",L"",Login,ES_AUTOHSCROLL); create(L"EDIT",L"",Password,ES_PASSWORD|ES_AUTOHSCROLL);
        SendMessageW(controls[Login],EM_SETCUEBANNER,TRUE,reinterpret_cast<LPARAM>(L"Adresse email"));
        SendMessageW(controls[Password],EM_SETCUEBANNER,TRUE,reinterpret_cast<LPARAM>(L"Mot de passe"));
        SendMessageW(controls[Login],EM_SETLIMITTEXT,254,0); SendMessageW(controls[Password],EM_SETLIMITTEXT,256,0);
        create(L"BUTTON",L"Se connecter",SignIn,BS_OWNERDRAW); create(L"BUTTON",L"Afficher",ShowPassword,BS_OWNERDRAW);
        create(L"EDIT",L"",Code,ES_AUTOHSCROLL); SendMessageW(controls[Code],EM_SETLIMITTEXT,64,0);
        create(L"BUTTON",L"Valider le code",Verify,BS_OWNERDRAW); create(L"BUTTON",L"Envoyer un code par email",EmailCode,BS_OWNERDRAW); create(L"BUTTON",L"Retour",Back,BS_OWNERDRAW);
        create(L"COMBOBOX",L"",Method,CBS_DROPDOWNLIST|WS_VSCROLL);
        for (auto [id,name] : std::vector<std::pair<int,const wchar_t*>>{{Refresh,L"Actualiser"},{Pause,L"Pause"},{Logout,L"Déconnexion"},{Export,L"Exporter"},{Website,L"Ouvrir le site"},{Overview,L"Vue d'ensemble"},{Services,L"Services"},{Metrics,L"Métriques"},{Incidents,L"Incidents"},{Preferences,L"Préférences"}}) create(L"BUTTON",name,id,BS_OWNERDRAW);
        tooltips = CreateWindowExW(WS_EX_TOPMOST, TOOLTIPS_CLASSW, nullptr, WS_POPUP | TTS_ALWAYSTIP, 0,0,0,0,window,nullptr,GetModuleHandleW(nullptr),nullptr);
        for (auto id : {Refresh,Pause,Logout,Export}) {
            TOOLINFOW info{}; info.cbSize=sizeof(info); info.uFlags=TTF_IDISHWND|TTF_SUBCLASS; info.hwnd=window; info.uId=reinterpret_cast<UINT_PTR>(controls[id]);
            info.lpszText=const_cast<wchar_t*>(id==Refresh?L"Actualiser":id==Pause?L"Suspendre / reprendre les mesures":id==Logout?L"Se déconnecter":L"Exporter un rapport JSON");
            SendMessageW(tooltips,TTM_ADDTOOLW,0,reinterpret_cast<LPARAM>(&info));
        }
        create(L"COMBOBOX",L"",Interval,CBS_DROPDOWNLIST|WS_VSCROLL);
        for (const auto* value : {L"5 secondes",L"15 secondes",L"30 secondes",L"60 secondes"}) SendMessageW(controls[Interval],CB_ADDSTRING,0,reinterpret_cast<LPARAM>(value));
        SendMessageW(controls[Interval],CB_SETCURSEL,refreshSeconds == 5 ? 0 : refreshSeconds == 15 ? 1 : refreshSeconds == 30 ? 2 : 3,0);
        create(L"COMBOBOX",L"",Period,CBS_DROPDOWNLIST|WS_VSCROLL);
        for (const auto* value : {L"30 jours",L"90 jours",L"365 jours"}) SendMessageW(controls[Period],CB_ADDSTRING,0,reinterpret_cast<LPARAM>(value));
        SendMessageW(controls[Period],CB_SETCURSEL,days == 30 ? 0 : days == 90 ? 1 : 2,0);
        SetFocus(controls[Login]); layout();
    }
    void move(int id, int x, int y, int w, int h) { MoveWindow(controls[id],px(x),px(y),px(w),px(h),TRUE); }
    void layout() {
        if (!window) return;
        RECT area{}; GetClientRect(window,&area); width = static_cast<int>((area.right-area.left)/dpi); height = static_cast<int>((area.bottom-area.top)/dpi);
        for (auto [id,control] : controls) {
            bool shown = authenticated ? id >= Refresh : mfa ? (id == Code || id == Verify || id == Method || id == Back || (id == EmailCode && std::find(mfaMethods.begin(),mfaMethods.end(),Json("email")) != mfaMethods.end())) : (id >= Login && id <= ShowPassword);
            ShowWindow(control,shown ? SW_SHOW : SW_HIDE);
            if (id == Refresh || id == Export || id == SignIn || id == Verify || id == EmailCode) EnableWindow(control,!busy && !preview);
        }
        int x = std::max(24,(width-420)/2), y = std::max(155,(height-430)/2);
        move(Login,x,y+115,420,40); move(Password,x,y+188,318,40); move(ShowPassword,x+328,y+188,92,40); move(SignIn,x,y+252,420,44);
        move(Method,x,y+105,420,240); move(Code,x,y+167,420,42); move(Verify,x,y+226,420,44); move(EmailCode,x,y+281,314,40); move(Back,x+326,y+281,94,40);
        for (int id = Overview; id <= Preferences; ++id) move(id,16,130+(id-Overview)*52,176,44);
        move(Website,16,std::max(410,height-74),176,40);
        int right = width-24;
        move(Logout,right-42,24,42,36); move(Export,right-92,24,42,36); move(Pause,right-142,24,42,36); move(Refresh,right-192,24,42,36);
        move(Interval,234,103,140,240); move(Period,390,103,124,240);
        EnableWindow(controls[Login],!busy); EnableWindow(controls[Password],!busy); EnableWindow(controls[Code],!busy);
        EnableWindow(controls[Period],!busy && !preview);
        SetWindowTextW(controls[Pause],paused ? L"Reprendre" : L"Pause");
        updateScroll(); InvalidateRect(window,nullptr,FALSE);
    }
    void updateScroll() {
        const int max = std::max(0,extent-std::max(0,height-180)); scroll = std::clamp(scroll,0,max);
        SCROLLINFO info{sizeof(info),SIF_RANGE|SIF_PAGE|SIF_POS,0,extent,static_cast<UINT>(std::max(0,height-180)),scroll,0}; SetScrollInfo(window,SB_VERT,&info,TRUE);
    }
    void saveSettings() {
        try { const auto path = settingsPath(); if (path.empty()) return; std::filesystem::create_directories(path.parent_path()); std::ofstream file(path); file << Json{{"interval",refreshSeconds},{"days",days}}.dump(2); } catch (...) { message = L"Les préférences n'ont pas pu être enregistrées."; }
    }
    void launch(std::wstring kind, std::function<JobResult(std::stop_token)> operation) {
        if (busy) return;
        if (worker.joinable()) worker.join();
        busy = true; layout(); const auto generation = epoch; HWND target = window;
        worker = std::jthread([target,generation,kind=std::move(kind),operation=std::move(operation)](std::stop_token stop) {
            auto result = std::make_unique<JobResult>();
            try { *result = operation(stop); } catch (...) { result->response.error = L"La requête n'a pas pu être terminée."; }
            result->epoch = generation; result->kind = kind;
            if (!stop.stop_requested() && IsWindow(target) && PostMessageW(target,RESPONSE,0,reinterpret_cast<LPARAM>(result.get()))) result.release();
        });
    }
    void signIn() {
        if (busy) return;
        login = input(controls[Login]); auto password = input(controls[Password]);
        if (login.empty() || password.empty()) { message = L"Indique ton email et ton mot de passe."; InvalidateRect(window,nullptr,FALSE); return; }
        Json body{{"login",utf8(login)},{"password",utf8(password)}};
        SecureZeroMemory(password.data(),password.size()*sizeof(wchar_t)); password.clear(); SetWindowTextW(controls[Password],L""); message.clear();
        launch(L"login",[this,body=std::move(body)](std::stop_token stop) mutable { JobResult result{}; result.response = api.request(L"/api/auth/login",L"POST",body,{},stop); clearSecret(body["password"].get_ref<std::string&>()); return result; });
    }
    void verify() {
        if (busy) return;
        const auto index = static_cast<std::size_t>(SendMessageW(controls[Method],CB_GETCURSEL,0,0));
        if (index >= mfaMethods.size()) return;
        Json body{{"challengeId",utf8(challenge)},{"login",utf8(login)},{"method",mfaMethods[index]},{"code",utf8(input(controls[Code]))}};
        if (body["code"].get<std::string>().empty()) { message = L"Indique le code reçu."; InvalidateRect(window,nullptr,FALSE); return; }
        SetWindowTextW(controls[Code],L"");
        launch(L"login",[this,body=std::move(body)](std::stop_token stop) mutable { JobResult result{}; result.response = api.request(L"/api/auth/mfa/verify",L"POST",body,{},stop); clearSecret(body["code"].get_ref<std::string&>()); return result; });
    }
    void refresh(bool force = false) {
        if (!authenticated || busy || preview || (paused && !force)) return;
        const bool slow = force || metrics.empty() || status.empty() || std::chrono::steady_clock::now() >= nextSlow;
        nextPoll = std::chrono::steady_clock::now()+std::chrono::seconds(IsIconic(window) ? std::max(60,refreshSeconds) : refreshSeconds);
        if (slow) nextSlow = std::chrono::steady_clock::now()+std::chrono::seconds(60);
        std::string session = token; const int range = days;
        launch(L"refresh",[this,session=std::move(session),range,slow](std::stop_token stop) mutable {
            JobResult result{}; result.response = api.request(L"/api/desktop/overview?points=360",L"GET",Json(),session,stop);
            if (result.response.status == 200 && result.response.error.empty() && slow && !stop.stop_requested()) {
                auto activity = api.request(L"/api/desktop/metrics?days="+std::to_wstring(range),L"GET",Json(),session,stop);
                if (activity.status == 401 || activity.status == 403) result.response = std::move(activity);
                else if (activity.status == 200 && activity.error.empty()) result.extra["metrics"] = std::move(activity.data);
                else result.extra["warning"] = utf8(activity.error);
                if (result.response.status == 200 && !stop.stop_requested()) {
                    auto services = api.request(L"/api/desktop/status?days="+std::to_wstring(range == 30 ? 7 : 90),L"GET",Json(),session,stop);
                    if (services.status == 401 || services.status == 403) result.response = std::move(services);
                    else if (services.status == 200 && services.error.empty()) result.extra["status"] = std::move(services.data);
                    else result.extra["warning"] = utf8(services.error);
                }
            }
            clearSecret(session); return result;
        });
    }
    void signedOut(const std::wstring& explanation = {}) {
        ++epoch; if (worker.joinable()) worker.request_stop(); busy = false; authenticated = false; mfa = false; clearSecret(token);
        snapshot = metrics = status = Json::object(); account.clear(); role.clear(); challenge.clear(); scroll = 0; message = explanation;
        SetWindowTextW(controls[Password],L""); SetWindowTextW(controls[Code],L""); layout(); SetFocus(controls[Login]);
    }
    void receive(std::unique_ptr<JobResult> result) {
        if (result->epoch != epoch) return;
        busy = false;
        if (!result->response.error.empty()) {
            if (result->kind == L"refresh" && (result->response.status == 401 || result->response.status == 403)) { signedOut(L"Session expirée ou accès retiré. Reconnecte-toi."); return; }
            message = result->response.error.substr(0,600); layout(); return;
        }
        auto& data = result->response.data;
        if (result->kind == L"login") {
            if (data.value("mfaRequired",false)) {
                mfa = true; challenge = text(data,"challengeId",L""); mfaMethods = child(data,"methods");
                SendMessageW(controls[Method],CB_RESETCONTENT,0,0);
                for (auto& method : mfaMethods) { const wchar_t* name = method == "totp" ? L"Application d'authentification" : method == "email" ? L"Code par email" : L"Code de récupération"; SendMessageW(controls[Method],CB_ADDSTRING,0,reinterpret_cast<LPARAM>(name)); }
                SendMessageW(controls[Method],CB_SETCURSEL,0,0); message = data.value("emailCodeSent",false) ? L"Un code de connexion a été envoyé par email." : L"Valide la connexion avec ta double authentification."; layout(); SetFocus(controls[Code]); return;
            }
            const auto user = child(data,"user");
            if (!user.value("admin",false) && !user.value("editor",false)) { if(data.contains("token") && data["token"].is_string()) clearSecret(data["token"].get_ref<std::string&>()); signedOut(L"Un compte administrateur ou éditeur est nécessaire."); return; }
            token = data.value("token",std::string()); if (token.empty()) { message = L"Le serveur n'a pas renvoyé de session."; layout(); return; }
            clearSecret(data["token"].get_ref<std::string&>());
            authenticated = true; mfa = false; account = text(user,"pseudo"); role = user.value("admin",false) ? L"admin" : L"editor"; message.clear(); view = Overview; scroll = 0; layout(); refresh(true);
        } else if (result->kind == L"email") { message = L"Un code a été envoyé par email."; layout(); }
        else {
            if (numeric(data,"schemaVersion") != 1 || !data.contains("health") || !data["health"].is_object() || !data["health"].contains("process")) { message = L"La version du serveur n'est pas compatible avec cette console."; layout(); return; }
            snapshot = std::move(data); if (result->extra.contains("metrics")) metrics = std::move(result->extra["metrics"]); if (result->extra.contains("status")) status = std::move(result->extra["status"]);
            account = text(child(snapshot,"viewer"),"name",account); role = text(child(snapshot,"viewer"),"role",role); message = text(result->extra,"warning",L""); layout();
        }
    }
    void exportData() {
        if (!authenticated || snapshot.empty()) return;
        wchar_t filename[MAX_PATH] = L"ktga-supervision.json";
        OPENFILENAMEW dialog{}; dialog.lStructSize = sizeof(dialog); dialog.hwndOwner = window; dialog.lpstrFilter = L"Rapport JSON\0*.json\0"; dialog.lpstrFile = filename; dialog.nMaxFile = MAX_PATH; dialog.lpstrDefExt = L"json"; dialog.Flags = OFN_OVERWRITEPROMPT|OFN_PATHMUSTEXIST|OFN_NOCHANGEDIR;
        if (!GetSaveFileNameW(&dialog)) return;
        try { std::ofstream file{std::filesystem::path(filename)}; if (!file) throw std::runtime_error("write"); file << Json{{"schemaVersion",1},{"overview",snapshot},{"metrics",metrics},{"status",status}}.dump(2); if (!file) throw std::runtime_error("write"); message = L"Le rapport a été exporté, sans identifiants de connexion."; }
        catch (...) { message = L"Le rapport n'a pas pu être enregistré."; }
        InvalidateRect(window,nullptr,FALSE);
    }
    void command(int id, int notification) {
        if (id == SignIn) signIn();
        else if (id == Verify) verify();
        else if (id == ShowPassword) { const auto shown = SendMessageW(controls[Password],EM_GETPASSWORDCHAR,0,0) == 0; SendMessageW(controls[Password],EM_SETPASSWORDCHAR,shown ? L'●' : 0,0); SetWindowTextW(controls[ShowPassword],shown ? L"Afficher" : L"Masquer"); InvalidateRect(controls[Password],nullptr,TRUE); }
        else if (id == Back) signedOut();
        else if (id == EmailCode) { for(std::size_t i=0;i<mfaMethods.size();++i) if(mfaMethods[i]=="email") SendMessageW(controls[Method],CB_SETCURSEL,i,0); Json body{{"challengeId",utf8(challenge)}}; launch(L"email",[this,body](std::stop_token stop) { JobResult result{}; result.response = api.request(L"/api/auth/mfa/email",L"POST",body,{},stop); return result; }); }
        else if (id == Logout) signedOut();
        else if (id == Refresh) refresh(true);
        else if (id == Pause) { paused = !paused; layout(); if (!paused) refresh(true); }
        else if (id == Export) exportData();
        else if (id == Website) ShellExecuteW(window,L"open",L"https://www.ktga.me/admin",nullptr,nullptr,SW_SHOWNORMAL);
        else if (id >= Overview && id <= Preferences) { view = id; scroll = 0; layout(); }
        else if (id == Interval && notification == CBN_SELCHANGE) { const int values[]{5,15,30,60}; const auto index = SendMessageW(controls[Interval],CB_GETCURSEL,0,0); if (index >= 0 && index < 4) refreshSeconds = values[index]; saveSettings(); nextPoll = std::chrono::steady_clock::now(); }
        else if (id == Period && notification == CBN_SELCHANGE) { const int values[]{30,90,365}; const auto index = SendMessageW(controls[Period],CB_GETCURSEL,0,0); if (index >= 0 && index < 3) days = values[index]; saveSettings(); nextSlow = {}; refresh(true); }
    }
    void kpi(HDC dc, int x, int y, int w, const std::wstring& name, const std::wstring& value, const std::wstring& detail, COLORREF color = gold) {
        fill(dc,rect(x,y,w,100),surface); frame(dc,rect(x,y,w,100),border); label(dc,name,rect(x+16,y+12,w-32,22),13,muted); label(dc,value,rect(x+16,y+35,w-32,32),25,color,true); label(dc,detail,rect(x+16,y+74,w-32,20),12,muted);
    }
    void chart(HDC dc, RECT box, const std::wstring& title, const Json& rows, const std::vector<std::pair<std::wstring,std::string>>& series, bool percent = false, double divisor = 1, const std::wstring& unit = L"") {
        label(dc,title,rect(box.left,box.top,box.right-box.left,24),16,ink,true);
        if (!rows.is_array() || rows.empty()) { label(dc,L"Aucun relevé disponible",rect(box.left,box.top+70,box.right-box.left,25),14,muted); return; }
        double maximum = percent ? 100 : 1;
        for (const auto& row : rows) for (const auto& entry : series) maximum = std::max(maximum,percent ? 100 : numeric(row,entry.second)/divisor);
        int left = box.left+54, right = box.right-12, top = box.top+60, bottom = box.bottom-26;
        for (int tick=0;tick<=4;++tick) { int y = top+(bottom-top)*tick/4; fill(dc,rect(left,y,right-left,1),border); label(dc,formatNumber(maximum*(4-tick)/4,maximum < 10 ? 1 : 0)+unit,rect(box.left,y-8,48,18),10,muted); }
        COLORREF colors[]{gold,green,blue,red}; int entryIndex = 0;
        for (const auto& entry : series) {
            const auto color = colors[entryIndex%4]; int legendX = box.left+entryIndex*std::max<int>(140,(box.right-box.left)/static_cast<int>(series.size()));
            fill(dc,rect(legendX,box.top+35,8,8),color); label(dc,entry.first,rect(legendX+14,box.top+29,std::max<int>(120,(box.right-box.left)/static_cast<int>(series.size())-20),20),11,muted);
            auto pen = CreatePen(PS_SOLID,2,color); auto prior = SelectObject(dc,pen); bool startedLine = false; int index=0;
            for (const auto& row : rows) {
                auto value = child(row,entry.second);
                if (!value.is_number()) { startedLine = false; ++index; continue; }
                double amount = std::clamp(value.get<double>()/divisor,0.0,maximum);
                int x = left+(rows.size() <= 1 ? 0 : (right-left)*index/static_cast<int>(rows.size()-1)), y = bottom-static_cast<int>((bottom-top)*amount/maximum);
                if (!startedLine) MoveToEx(dc,x,y,nullptr); else LineTo(dc,x,y);
                fill(dc,rect(x-1,y-1,3,3),color); startedLine = true; ++index;
            }
            SelectObject(dc,prior); DeleteObject(pen); ++entryIndex;
        }
        const auto key = rows[0].contains("date") ? "date" : "at";
        auto first=text(rows[0],key),last=text(rows.back(),key); if(std::string(key)=="at") { first=formatTime(first); last=formatTime(last); }
        label(dc,first,rect(left,bottom+8,150,16),10,muted); label(dc,last,rect(right-150,bottom+8,150,16),10,muted,false,DT_RIGHT|DT_TOP|DT_END_ELLIPSIS|DT_NOPREFIX);
    }
    void paintBody(HDC dc) {
        const int x=234, contentWidth=std::max(300,width-x-26), start=164-scroll;
        auto health=child(snapshot,"health"), live=child(health,"realtime"), process=child(health,"process"), system=child(health,"system"), traffic=child(health,"traffic"), loop=child(health,"eventLoop"), history=child(health,"history");
        int y=start;
        if (snapshot.empty()) { label(dc,busy ? L"Récupération des premières mesures…" : L"Les mesures sont indisponibles. Actualise pour réessayer.",rect(x,y,contentWidth,60),17,muted); extent=120; return; }
        if (view==Overview) {
            const int columns=contentWidth>=900?4:3, gap=12, tile=(contentWidth-(columns-1)*gap)/columns;
            std::vector<std::tuple<std::wstring,std::wstring,std::wstring>> values{
                {L"Comptes connectés",formatNumber(numeric(snapshot,"connectedUsers")),L"Utilisateurs distincts"},
                {L"Tables en jeu",formatNumber(numeric(live,"playingRooms")),formatNumber(numeric(live,"waitingRooms"))+L" en attente"},
                {L"Requêtes / seconde",formatNumber(numeric(traffic,"requestsPerSecond"),1),L"Hors sondes de supervision"},
                {L"Boucle serveur P95",formatNumber(numeric(loop,"p95Ms"),1)+L" ms",L"Relevé récent"},
                {L"CPU machine",formatNumber(numeric(system,"cpuPercent"),1)+L" %",formatNumber(numeric(system,"cpuCount"))+L" processeurs"},
                {L"Mémoire serveur",formatBytes(numeric(child(process,"memory"),"rss")),L"Mémoire résidente"},
                {L"Connexions temps réel",formatNumber(numeric(live,"sockets")),L"Plusieurs possibles par joueur"},
                {L"Mémoire libre",formatBytes(numeric(system,"freeMemory")),L"Disponible sur le VPS"}
            };
            for (int i=0;i<static_cast<int>(values.size());++i) { const auto& [name,value,detail]=values[i]; kpi(dc,x+(i%columns)*(tile+gap),y+(i/columns)*112,tile,name,value,detail,i%3==0?green:gold); }
            y+=static_cast<int>((values.size()+columns-1)/columns)*112+24;
            const int chartColumns=contentWidth>=850?2:1, chartWidth=(contentWidth-(chartColumns-1)*24)/chartColumns;
            chart(dc,rect(x,y,chartWidth,230),L"Trafic API",history,{{L"Requêtes/s","requestsPerSecond"}});
            chart(dc,rect(x+(chartColumns==2?chartWidth+24:0),y+(chartColumns==1?252:0),chartWidth,230),L"Latence de la boucle",history,{{L"P95","eventLoopP95"},{L"Maximum","eventLoopMax"}},false,1,L"ms");
            y+=chartColumns==2?256:508;
            chart(dc,rect(x,y,chartWidth,230),L"CPU de la machine",history,{{L"CPU système","cpuSystem"}},true,1,L"%");
            chart(dc,rect(x+(chartColumns==2?chartWidth+24:0),y+(chartColumns==1?252:0),chartWidth,230),L"Mémoire de l'API",history,{{L"Résidente","memoryRss"},{L"Tas JS","memoryHeap"}},false,1048576,L"M");
            y+=chartColumns==2?256:508;
        } else if (view==Services) {
            label(dc,L"Disponibilité des services",rect(x,y,contentWidth,28),20,ink,true); y+=42;
            const auto components=child(status,"components");
            if (components.is_array()) for (const auto& item:components) {
                fill(dc,rect(x,y,contentWidth,1),border); label(dc,text(item,"name"),rect(x,y+16,220,24),15,ink,true);
                const auto state=text(item,"status"); label(dc,statusLabel(state),rect(x+220,y+16,160,22),13,severity(state));
                const auto uptime=child(item,"uptime"); label(dc,uptime.is_number()?formatNumber(uptime.get<double>(),2)+L" %":L"Sans mesures",rect(x+390,y+16,120,22),13,muted);
                const auto slots=child(item,"days"); const int barLeft=x, barTop=y+54, barWidth=contentWidth;
                if (slots.is_array() && !slots.empty()) {
                    for (int i=0;i<static_cast<int>(slots.size());++i) { auto cell=slots[i]; const auto state=text(cell,"status"); const auto color=state==L"operational"?green:state==L"degraded"?gold:state==L"outage"?red:border; int left=barLeft+barWidth*i/static_cast<int>(slots.size()), next=barLeft+barWidth*(i+1)/static_cast<int>(slots.size()); fill(dc,rect(left,barTop,std::max(1,next-left-2),14),color); }
                    label(dc,text(slots[0],"date"),rect(x,barTop+20,160,18),11,muted); label(dc,text(slots.back(),"date"),rect(x+contentWidth-160,barTop+20,160,18),11,muted,false,DT_RIGHT|DT_NOPREFIX);
                } else label(dc,L"Historique indisponible",rect(x,barTop,contentWidth,20),12,muted);
                y+=108;
            }
            y+=20; label(dc,L"Services applicatifs et workers",rect(x,y,contentWidth,28),20,ink,true); y+=42;
            std::vector<int> offsets{0,280,380,470,580}; const int scale=contentWidth>=700?1:0;
            label(dc,L"Service",rect(x,y,270,24),12,muted); label(dc,L"Terminés",rect(x+offsets[1],y,100,24),12,muted); label(dc,L"File",rect(x+offsets[2],y,80,24),12,muted); if(scale) label(dc,L"P95 traitement",rect(x+offsets[3],y,130,24),12,muted); y+=30;
            const auto services=child(health,"services");
            if(services.is_object()) for(const auto& [id,item]:services.items()) {
                fill(dc,rect(x,y,contentWidth,1),border); label(dc,text(item,"name"),rect(x,y+10,270,24),14,ink);
                label(dc,formatNumber(numeric(item,"completed")),rect(x+offsets[1],y+10,90,24),14,green); label(dc,formatNumber(numeric(item,"queued")),rect(x+offsets[2],y+10,60,24),14,ink);
                if(scale) { auto p95=child(child(item,"processing"),"p95Ms"); label(dc,p95.is_number()?formatNumber(p95.get<double>(),1)+L" ms":L"-",rect(x+offsets[3],y+10,130,24),13,muted); }
                y+=44;
            }
            y+=20; chart(dc,rect(x,y,contentWidth,240),L"Files de traitements",history,{{L"Mots de passe","workerQueued"},{L"Lectures","readingWorkerQueued"}}); y+=262;
        } else if (view==Metrics) {
            if(metrics.empty()) { label(dc,L"Les métriques d'activité sont en cours de chargement.",rect(x,y,contentWidth,50),16,muted); y+=70; }
            else {
                auto summary=child(metrics,"summary"); const int tile=(contentWidth-24)/3;
                kpi(dc,x,y,tile,L"Comptes",formatNumber(numeric(summary,"accounts")),formatNumber(numeric(summary,"activeAccounts"))+L" actifs");
                kpi(dc,x+tile+12,y,tile,L"Parties terminées",formatNumber(numeric(summary,"games")),formatNumber(numeric(metrics,"days"))+L" jours");
                kpi(dc,x+(tile+12)*2,y,tile,L"Joueurs actifs",formatNumber(numeric(summary,"activePlayers")),L"Au moins une activité"); y+=128;
                auto activity=child(child(metrics,"activity"),"daily"); chart(dc,rect(x,y,contentWidth,260),L"Activité quotidienne",activity,{{L"Parties","games"},{L"Joueurs actifs","activePlayers"},{L"Inscriptions","signups"}}); y+=290;
                label(dc,L"Répartition des jeux",rect(x,y,contentWidth,28),20,ink,true); y+=42;
                label(dc,L"Jeu",rect(x,y,260,20),12,muted); label(dc,L"Parties",rect(x+280,y,100,20),12,muted); label(dc,L"Joueurs",rect(x+390,y,100,20),12,muted); label(dc,L"Présence IA",rect(x+510,y,120,20),12,muted); y+=28;
                auto gameRows=child(metrics,"games"); if(gameRows.is_array()) for(const auto& game:gameRows) { fill(dc,rect(x,y,contentWidth,1),border); label(dc,text(game,"name"),rect(x,y+10,270,24),14,ink); label(dc,formatNumber(numeric(game,"games")),rect(x+280,y+10,100,24),14,gold); label(dc,formatNumber(numeric(game,"uniquePlayers")),rect(x+390,y+10,100,24),14,ink); label(dc,formatNumber(numeric(game,"botRate")*100,1)+L" %",rect(x+510,y+10,120,24),13,muted); y+=42; }
                y+=24; label(dc,L"Progression et contenu",rect(x,y,contentWidth,26),20,ink,true); y+=42;
                auto success=child(metrics,"achievements"), shop=child(metrics,"shop"), events=child(child(metrics,"communityEvents"),"summary");
                kpi(dc,x,y,tile,L"Succès obtenus",formatNumber(numeric(success,"unlocked")),formatNumber(numeric(success,"catalog"))+L" succès disponibles",green);
                kpi(dc,x+tile+12,y,tile,L"Achats boutique",formatNumber(numeric(shop,"purchases")),formatNumber(numeric(shop,"catalogItems"))+L" objets au catalogue",blue);
                kpi(dc,x+(tile+12)*2,y,tile,L"Actions communautaires",formatNumber(numeric(events,"actions")),formatNumber(numeric(events,"active"))+L" événements actifs"); y+=124;
            }
        } else if(view==Incidents) {
            label(dc,L"Incidents publiés",rect(x,y,contentWidth,28),20,ink,true); y+=44; incidentAreas.clear();
            auto render=[&](const Json& entries) { if(!entries.is_array()) return; for(const auto& item:entries) { const auto area=rect(x,y,contentWidth,98); fill(dc,area,surface); frame(dc,area,border); incidentAreas.emplace_back(area,item); label(dc,text(item,"title"),rect(x+16,y+12,contentWidth-180,26),16,ink,true); label(dc,statusLabel(text(item,"state")),rect(x+contentWidth-150,y+14,130,22),13,green); auto at=text(item,"scheduledAt",L""); if(at.empty()) at=text(item,"createdAt"); label(dc,formatTime(at),rect(x+16,y+44,contentWidth-32,20),12,muted); label(dc,text(item,"message",L"Aucune description"),rect(x+16,y+70,contentWidth-32,20),13,muted); y+=110; } };
            auto current=child(status,"incidents"), previous=child(status,"history"); render(current);
            if(current.empty()) { label(dc,L"Aucun incident public en cours.",rect(x,y,contentWidth,28),16,green); y+=50; }
            label(dc,L"Historique récent",rect(x,y,contentWidth,28),18,ink,true); y+=42; render(previous);
            if(previous.empty()) { label(dc,L"Aucun incident terminé dans cette période.",rect(x,y,contentWidth,28),14,muted); y+=40; }
        } else {
            label(dc,L"Connexion et affichage",rect(x,y,contentWidth,28),20,ink,true); y+=48;
            std::vector<std::pair<std::wstring,std::wstring>> settings{{L"API",endpoint},{L"Compte",account},{L"Rôle",role==L"admin"?L"Administrateur":L"Éditeur"},{L"Actualisation",std::to_wstring(refreshSeconds)+L" secondes"},{L"Métriques d'activité",std::to_wstring(days)+L" jours"},{L"Mesures techniques",L"Jusqu'à 30 minutes, échantillons de 5 secondes"},{L"Horaires",L"Heure locale de ce PC"},{L"Session",L"En mémoire uniquement, non conservée à la fermeture"},{L"Mot de passe",L"Jamais enregistré"},{L"Transport",preview?L"Aperçu local":endpoint.starts_with(L"https:")?L"HTTPS, certificats vérifiés":L"Instance locale de test"},{L"Permissions",L"Consultation uniquement"}};
            for(const auto& [name,value]:settings) { fill(dc,rect(x,y,contentWidth,1),border); label(dc,name,rect(x,y+13,210,24),14,muted); label(dc,value,rect(x+224,y+13,contentWidth-224,34),14,ink); y+=56; }
            y+=20; label(dc,L"La fréquence et la période se règlent dans la barre supérieure. Les métriques d'activité et l'état des services sont rafraîchis au plus une fois par minute. Aucun fichier personnel ou secret du serveur n'est accessible depuis cette console.",rect(x,y,contentWidth,100),14,muted,false,DT_WORDBREAK|DT_NOPREFIX); y+=110;
        }
        extent=std::max(0,y-start+32);
    }
    void paint(HDC provided = nullptr) {
        PAINTSTRUCT ps{}; HDC target=provided?provided:BeginPaint(window,&ps); RECT client{}; GetClientRect(window,&client);
        HDC dc=CreateCompatibleDC(target); HBITMAP bitmap=CreateCompatibleBitmap(target,std::max(1L,client.right),std::max(1L,client.bottom)); auto old=SelectObject(dc,bitmap);
        SetGraphicsMode(dc,GM_ADVANCED); XFORM transform{dpi,0,0,dpi,0,0}; SetWorldTransform(dc,&transform);
        fill(dc,rect(0,0,width,height),background);
        label(dc,L"KTGA.ME",rect(24,22,250,35),26,gold,true); label(dc,L"CONSOLE DE SUPERVISION",rect(26,62,300,24),11,muted);
        if(!authenticated) {
            int x=std::max(24,(width-420)/2),y=std::max(155,(height-430)/2);
            label(dc,mfa?L"Vérification de connexion":L"Connexion à la console",rect(x,y,420,40),24,ink,true);
            label(dc,L"Administrateurs et éditeurs",rect(x,y+49,420,24),14,muted);
            if(mfa) { label(dc,L"Méthode de vérification",rect(x,y+80,420,20),13,muted); label(dc,L"Code de connexion",rect(x,y+142,420,20),13,muted); }
            else { label(dc,L"Adresse email",rect(x,y+90,420,20),13,muted); label(dc,L"Mot de passe",rect(x,y+163,420,20),13,muted); }
            if(!message.empty()) label(dc,message,rect(x,y+(mfa?340:320),420,110),14,red,false,DT_WORDBREAK|DT_NOPREFIX);
            label(dc,endpoint,rect(x,height-65,420,22),12,muted); extent=0;
        } else {
            fill(dc,rect(208,96,1,height-96),border); fill(dc,rect(0,92,width,1),border);
            label(dc,account+L" · "+(role==L"admin"?L"Administrateur":L"Éditeur"),rect(234,26,std::max(150,width-460),24),15,ink,true);
            auto state=text(child(snapshot,"health"),"status"); const auto publicState=text(status,"status"); if(publicState==L"outage" || publicState==L"degraded") state=publicState;
            label(dc,preview?L"Aperçu local":busy?L"Actualisation…":paused?L"Actualisation en pause":statusLabel(state),rect(234,56,std::max(150,width-460),22),12,preview?blue:severity(state));
            const std::wstring title=view==Overview?L"Vue d'ensemble":view==Services?L"Services":view==Metrics?L"Métriques":view==Incidents?L"Incidents":L"Préférences";
            label(dc,title,rect(550,106,std::max(120,width-574),28),22,ink,true);
            const int saved=SaveDC(dc); IntersectClipRect(dc,216,150,width,height-26); paintBody(dc); RestoreDC(dc,saved);
            fill(dc,rect(216,height-26,width-216,26),background); fill(dc,rect(216,height-27,width-216,1),border);
            std::wstring footer = message.empty()?L"Dernier relevé : "+formatTime(text(snapshot,"generatedAt",L""))+L" · v"+text(snapshot,"version",L"-"):message;
            label(dc,footer,rect(234,height-22,width-255,20),11,message.empty()?muted:red);
            updateScroll();
        }
        XFORM identity{1,0,0,1,0,0}; SetWorldTransform(dc,&identity); BitBlt(target,0,0,client.right,client.bottom,dc,0,0,SRCCOPY); SelectObject(dc,old); DeleteObject(bitmap); DeleteDC(dc); if(!provided) EndPaint(window,&ps);
    }
    void drawButton(DRAWITEMSTRUCT* item) {
        const auto id=static_cast<int>(item->CtlID); const bool selected=id==view, disabled=(item->itemState&ODS_DISABLED)!=0, down=(item->itemState&ODS_SELECTED)!=0;
        fill(item->hDC,item->rcItem,selected||down?RGB(47,47,31):surface); frame(item->hDC,item->rcItem,selected?gold:border);
        auto title=input(item->hwndItem); const bool iconOnly=id==Refresh||id==Pause||id==Export||id==Logout;
        if(iconOnly) { const wchar_t* icon=id==Refresh?L"\uE72C":id==Pause?(paused?L"\uE768":L"\uE769"):id==Export?L"\uE74E":L"\uE8AC"; auto font=CreateFontW(-px(18),0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,ANTIALIASED_QUALITY,DEFAULT_PITCH,L"Segoe MDL2 Assets"); auto old=SelectObject(item->hDC,font); SetBkMode(item->hDC,TRANSPARENT); SetTextColor(item->hDC,disabled?muted:gold); auto area=item->rcItem; DrawTextW(item->hDC,icon,-1,&area,DT_CENTER|DT_VCENTER|DT_SINGLELINE); SelectObject(item->hDC,old); DeleteObject(font); }
        else { auto area=item->rcItem; area.left+=px(12); area.right-=px(8); label(item->hDC,title,area,px(14),disabled?muted:selected?gold:ink,true,DT_SINGLELINE|DT_VCENTER|DT_CENTER|DT_END_ELLIPSIS|DT_NOPREFIX); }
        if(item->itemState&ODS_FOCUS) { auto area=item->rcItem; InflateRect(&area,-3,-3); DrawFocusRect(item->hDC,&area); }
    }
    static LRESULT CALLBACK proc(HWND hwnd,UINT msg,WPARAM w,LPARAM l) {
        auto self=reinterpret_cast<Console*>(GetWindowLongPtrW(hwnd,GWLP_USERDATA));
        if(msg==WM_NCCREATE) { self=reinterpret_cast<Console*>(reinterpret_cast<CREATESTRUCTW*>(l)->lpCreateParams); self->window=hwnd; SetWindowLongPtrW(hwnd,GWLP_USERDATA,reinterpret_cast<LONG_PTR>(self)); }
        if(!self) return DefWindowProcW(hwnd,msg,w,l);
        switch(msg) {
            case WM_CREATE: self->initialize(); return 0;
            case WM_SIZE: self->layout(); return 0;
            case WM_DPICHANGED: self->dpi=HIWORD(w)/96.0f; self->updateFont(); { auto area=reinterpret_cast<RECT*>(l); SetWindowPos(hwnd,nullptr,area->left,area->top,area->right-area->left,area->bottom-area->top,SWP_NOZORDER|SWP_NOACTIVATE); } return 0;
            case WM_GETMINMAXINFO: { RECT area{}; SystemParametersInfoW(SPI_GETWORKAREA,0,&area,0); auto limits=reinterpret_cast<MINMAXINFO*>(l); limits->ptMinTrackSize={std::min<LONG>(self->px(900),area.right-area.left),std::min<LONG>(self->px(620),area.bottom-area.top)}; return 0; }
            case WM_PAINT: self->paint(); return 0;
            case WM_PRINTCLIENT: self->paint(reinterpret_cast<HDC>(w)); return 0;
            case WM_ERASEBKGND: return 1;
            case WM_DRAWITEM: self->drawButton(reinterpret_cast<DRAWITEMSTRUCT*>(l)); return TRUE;
            case WM_CTLCOLOREDIT: case WM_CTLCOLORSTATIC: { auto dc=reinterpret_cast<HDC>(w); SetTextColor(dc,ink); SetBkColor(dc,RGB(29,41,35)); return reinterpret_cast<LRESULT>(self->editBrush); }
            case WM_COMMAND: self->command(LOWORD(w),HIWORD(w)); return 0;
            case RESPONSE: self->receive(std::unique_ptr<JobResult>(reinterpret_cast<JobResult*>(l))); return 0;
            case WM_TIMER: if(self->authenticated && !self->paused && !self->busy && std::chrono::steady_clock::now()>=self->nextPoll) self->refresh(); return 0;
            case WM_MOUSEWHEEL: self->scroll-=GET_WHEEL_DELTA_WPARAM(w)/WHEEL_DELTA*66; self->updateScroll(); InvalidateRect(hwnd,nullptr,FALSE); return 0;
            case WM_VSCROLL: { SCROLLINFO info{}; info.cbSize=sizeof(info); info.fMask=SIF_ALL; GetScrollInfo(hwnd,SB_VERT,&info); switch(LOWORD(w)) { case SB_LINEUP:self->scroll-=32;break;case SB_LINEDOWN:self->scroll+=32;break;case SB_PAGEUP:self->scroll-=static_cast<int>(info.nPage);break;case SB_PAGEDOWN:self->scroll+=static_cast<int>(info.nPage);break;case SB_THUMBTRACK:self->scroll=info.nTrackPos;break; } self->updateScroll(); InvalidateRect(hwnd,nullptr,FALSE); return 0; }
            case WM_LBUTTONUP: if(self->view==Incidents && GET_Y_LPARAM(l)/self->dpi>=150 && GET_Y_LPARAM(l)/self->dpi<self->height-26) { const POINT point{static_cast<LONG>(GET_X_LPARAM(l)/self->dpi),static_cast<LONG>(GET_Y_LPARAM(l)/self->dpi)}; for(const auto& [area,item]:self->incidentAreas) if(PtInRect(&area,point)) { std::wstring content=text(item,"message")+L"\r\n\r\n"; auto updates=child(item,"updates"); if(updates.is_array()) for(const auto& update:updates) content+=formatTime(text(update,"createdAt"))+L" · "+statusLabel(text(update,"state"))+L"\r\n"+text(update,"message")+L"\r\n\r\n"; detailWindow(hwnd,text(item,"title"),content); break; } } return 0;
            case WM_CLOSE: ++self->epoch; if(self->worker.joinable()) { self->worker.request_stop(); self->worker.join(); } { MSG pending{}; while(PeekMessageW(&pending,hwnd,RESPONSE,RESPONSE,PM_REMOVE)) delete reinterpret_cast<JobResult*>(pending.lParam); } DestroyWindow(hwnd); return 0;
            case WM_DESTROY: clearSecret(self->token); PostQuitMessage(0); return 0;
        }
        return DefWindowProcW(hwnd,msg,w,l);
    }
};
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,LPWSTR,int show) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    INITCOMMONCONTROLSEX common{sizeof(common),ICC_STANDARD_CLASSES}; InitCommonControlsEx(&common);
    int count=0; auto args=CommandLineToArgvW(GetCommandLineW(),&count); std::wstring endpoint=L"https://api.ktga.me"; std::filesystem::path fixture;
    for(int i=1;i<count;++i) { const std::wstring arg=args[i]; if(arg==L"--self-test") { LocalFree(args); return selfTest(); } if(arg==L"--server"&&i+1<count) endpoint=args[++i]; else if(arg==L"--fixture"&&i+1<count) fixture=args[++i]; }
    LocalFree(args);
    try { Console app(endpoint,fixture); return app.run(instance,show); }
    catch(...) { MessageBoxW(nullptr,L"La console ne peut pas démarrer. Vérifie sa configuration et ses fichiers.",L"KTGA.ME",MB_OK|MB_ICONERROR); return 1; }
}
