import AppKit
import MusicKit
import Security

// native/apple-music/main.swift
// A single serialized command stream keeps late play requests from overtaking newer selections.
@main struct FoliaMusicBridge {
    @MainActor static func main() async {
        _ = NSApplication.shared
        var trackID = ""
        var trackDuration: Double = 0
        while let line = await nextLine() {
            var requestID = 0
            do {
                guard let data = line.data(using: .utf8),
                      let request = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let operation = request["operation"] as? String else { continue }
                requestID = request["id"] as? Int ?? 0
                let params = request["params"] as? [String: Any] ?? [:]
                let result: Any
                switch operation {
                case "health":
                    result = ["available": true, "signed": hasDeveloperSignature(), "authorization": authorization()]
                case "authorize":
                    guard hasDeveloperSignature() else { throw BridgeError("developer-setup", "请先使用已启用 MusicKit 的 Apple Developer 身份签名。设置步骤见项目 APPLE_MUSIC.md。") }
                    let status = await MusicAuthorization.request()
                    guard status == .authorized else { throw BridgeError("auth-required", "请在系统设置中允许 Folia Apple Music 访问媒体与 Apple Music。") }
                    let subscription = try await MusicSubscription.current
                    guard subscription.canPlayCatalogContent else { throw BridgeError("membership-required", "此 Apple 账号没有可播放完整曲目的 Apple Music 订阅。") }
                    result = ["authorized": true, "canPlay": true]
                case "status":
                    result = ["authorized": MusicAuthorization.currentStatus == .authorized, "signed": hasDeveloperSignature()]
                case "api":
                    try requireAuthorization()
                    guard let path = params["path"] as? String, path.hasPrefix("/v1/"),
                          !path.contains(".."), !path.contains("\\"), !path.contains("#") else { throw BridgeError("unsupported", "Invalid Apple Music API path") }
                    var components = URLComponents(string: "https://api.music.apple.com" + path)!
                    if let query = params["query"] as? [String: String] {
                        components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
                    }
                    guard let url = components.url, url.host == "api.music.apple.com" else { throw BridgeError("unsupported", "Invalid Apple Music API URL") }
                    var urlRequest = URLRequest(url: url)
                    let method = params["method"] as? String ?? "GET"
                    guard ["GET", "POST"].contains(method) else { throw BridgeError("unsupported", "Unsupported API method") }
                    urlRequest.httpMethod = method
                    if let body = params["body"] {
                        urlRequest.httpBody = try JSONSerialization.data(withJSONObject: body)
                        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    }
                    let response = try await MusicDataRequest(urlRequest: urlRequest).response()
                    result = response.data.isEmpty ? [:] : try JSONSerialization.jsonObject(with: response.data)
                case "storefront":
                    try requireAuthorization()
                    result = ["id": try await MusicDataRequest.currentCountryCode.lowercased()]
                case "play":
                    try requireAuthorization()
                    let subscription = try await MusicSubscription.current
                    guard subscription.canPlayCatalogContent else { throw BridgeError("membership-required", "需要有效 Apple Music 订阅。") }
                    guard let id = params["mediaId"] as? String, !id.isEmpty else { throw BridgeError("invalid-response", "Missing song ID") }
                    let player = ApplicationMusicPlayer.shared
                    player.stop()
                    let song: Song
                    if id.hasPrefix("i.") {
                        var request = MusicLibraryRequest<Song>()
                        request.filter(matching: \.id, equalTo: MusicItemID(id))
                        guard let item = try await request.response().items.first else { throw BridgeError("not-playable", "个人资料库中的歌曲当前无法播放。") }
                        song = item
                    } else {
                        let request = MusicCatalogResourceRequest<Song>(matching: \.id, equalTo: MusicItemID(id))
                        guard let item = try await request.response().items.first else { throw BridgeError("not-playable", "当前地区没有此歌曲。") }
                        song = item
                    }
                    player.queue = ApplicationMusicPlayer.Queue(for: [song])
                    trackID = id
                    trackDuration = song.duration ?? 0
                    try await player.play()
                    result = snapshot(trackID, trackDuration)
                case "resume":
                    try await ApplicationMusicPlayer.shared.play()
                    result = snapshot(trackID, trackDuration)
                case "pause":
                    ApplicationMusicPlayer.shared.pause()
                    result = snapshot(trackID, trackDuration)
                case "stop":
                    ApplicationMusicPlayer.shared.stop()
                    trackID = ""
                    trackDuration = 0
                    result = snapshot(trackID, trackDuration)
                case "seek":
                    let time = params["time"] as? Double ?? 0
                    guard time.isFinite else { throw BridgeError("invalid-response", "Invalid seek time") }
                    ApplicationMusicPlayer.shared.playbackTime = max(0, min(time, trackDuration))
                    result = snapshot(trackID, trackDuration)
                case "state": result = snapshot(trackID, trackDuration)
                case "logout":
                    ApplicationMusicPlayer.shared.stop()
                    trackID = ""
                    result = [:] // System authorization is revoked in macOS System Settings, never in a webview.
                default: throw BridgeError("unsupported", "Unknown MusicKit operation")
                }
                emit(["id": requestID, "result": result])
            } catch let error as BridgeError {
                emit(["id": requestID, "error": ["code": error.code, "message": error.message]])
            } catch {
                emit(["id": requestID, "error": ["code": "service-unavailable", "message": error.localizedDescription]])
            }
        }
        ApplicationMusicPlayer.shared.stop()
    }

    nonisolated static func nextLine() async -> String? {
        await Task.detached { readLine() }.value
    }
    @MainActor static func snapshot(_ id: String, _ duration: Double) -> [String: Any] {
        let player = ApplicationMusicPlayer.shared
        return ["mediaId": id, "time": max(0, player.playbackTime), "duration": duration,
                "playing": player.state.playbackStatus == .playing,
                "status": String(describing: player.state.playbackStatus)]
    }
    static func authorization() -> String { String(describing: MusicAuthorization.currentStatus) }
    static func requireAuthorization() throws {
        guard hasDeveloperSignature() else { throw BridgeError("developer-setup", "尚未完成 Apple Developer 签名配置，请参阅 APPLE_MUSIC.md。") }
        guard MusicAuthorization.currentStatus == .authorized else { throw BridgeError("auth-required", "请先连接 Apple Music。") }
    }
    static func hasDeveloperSignature() -> Bool {
        var code: SecCode?
        var info: CFDictionary?
        var staticCode: SecStaticCode?
        guard SecCodeCopySelf([], &code) == errSecSuccess, let code,
              SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode,
              SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let dict = info as? [String: Any] else { return false }
        return dict[kSecCodeInfoTeamIdentifier as String] is String
    }
    static func emit(_ response: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: response, options: [.sortedKeys]) else { return }
        FileHandle.standardOutput.write(data + Data([10]))
    }
}
struct BridgeError: Error {
    let code: String
    let message: String
    init(_ code: String, _ message: String) { self.code = code; self.message = message }
}
