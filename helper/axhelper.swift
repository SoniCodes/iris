// axhelper: reads the macOS Accessibility API, speaks JSON over stdio.
// one command per line in, one response per line out.
//
//   {"cmd":"ping"} {"cmd":"permission"} {"cmd":"apps"} {"cmd":"frontmost"}
//   {"cmd":"enable"} {"cmd":"dump"[,"pid":N|"bundleId":"..."][,"maxDepth":N,
//    "maxNodes":N,"timeoutSeconds":N,"allAttributes":true]}

import AppKit
import ApplicationServices
import Darwin
import Foundation

let defaultMaxDepth = 40
let defaultMaxNodes = 20000
let defaultTimeout: Float = 2.0

let attrRole = kAXRoleAttribute as String
let attrSubrole = kAXSubroleAttribute as String
let attrTitle = kAXTitleAttribute as String
let attrValue = kAXValueAttribute as String
let attrDescription = kAXDescriptionAttribute as String
let attrHelp = kAXHelpAttribute as String
let attrChildren = kAXChildrenAttribute as String
let attrPosition = kAXPositionAttribute as String
let attrSize = kAXSizeAttribute as String
let attrEnabled = kAXEnabledAttribute as String
let attrFocused = kAXFocusedAttribute as String
let attrMenuBar = kAXMenuBarAttribute as String
let attrMenuBarRole = kAXMenuBarRole as String
let attrWindows = kAXWindowsAttribute as String
let attrWindowRole = kAXWindowRole as String

// what makes a toolkit build its tree. both seen in research/ dumps.
let attrManualAccessibility = "AXManualAccessibility"
let attrEnhancedUserInterface = "AXEnhancedUserInterface"
let attrFocusedApp = kAXFocusedApplicationAttribute as String

let expensiveAttributes: Set<String> = [attrChildren, "AXVisibleChildren", "AXRows", "AXColumns", "AXCells"]

func copyValue(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else {
        return nil
    }
    return value
}

func attributeNames(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyAttributeNames(element, &names) == .success else { return [] }
    return (names as? [String]) ?? []
}

func actionNames(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyActionNames(element, &names) == .success else { return [] }
    return (names as? [String]) ?? []
}

func stringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
    guard let raw = copyValue(element, attribute) else { return nil }
    return raw as? String
}

func boolAttribute(_ element: AXUIElement, _ attribute: String) -> Bool? {
    guard let raw = copyValue(element, attribute) else { return nil }
    return (raw as? NSNumber)?.boolValue
}

func children(of element: AXUIElement) -> [AXUIElement] {
    guard let raw = copyValue(element, attrChildren) else { return [] }
    return (raw as? [AXUIElement]) ?? []
}

func frame(of element: AXUIElement) -> [String: Double]? {
    guard let positionRef = copyValue(element, attrPosition),
          let sizeRef = copyValue(element, attrSize),
          CFGetTypeID(positionRef) == AXValueGetTypeID(),
          CFGetTypeID(sizeRef) == AXValueGetTypeID()
    else { return nil }

    var point = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(positionRef as! AXValue, .cgPoint, &point),
          AXValueGetValue(sizeRef as! AXValue, .cgSize, &size)
    else { return nil }

    // top-left origin, unlike Cocoa
    return ["x": point.x, "y": point.y, "w": size.width, "h": size.height]
}

func describe(_ raw: CFTypeRef) -> Any {
    let typeID = CFGetTypeID(raw)

    if typeID == CFStringGetTypeID() { return raw as! String }
    if typeID == CFBooleanGetTypeID() { return CFBooleanGetValue((raw as! CFBoolean)) }
    if typeID == CFNumberGetTypeID() { return (raw as! NSNumber).doubleValue }
    if typeID == AXUIElementGetTypeID() { return "<AXUIElement>" }
    if typeID == CFArrayGetTypeID() { return "<array count=\(CFArrayGetCount((raw as! CFArray)))>" }

    if typeID == AXValueGetTypeID() {
        let value = raw as! AXValue
        switch AXValueGetType(value) {
        case .cgPoint:
            var point = CGPoint.zero
            AXValueGetValue(value, .cgPoint, &point)
            return ["x": point.x, "y": point.y]
        case .cgSize:
            var size = CGSize.zero
            AXValueGetValue(value, .cgSize, &size)
            return ["w": size.width, "h": size.height]
        case .cgRect:
            var rect = CGRect.zero
            AXValueGetValue(value, .cgRect, &rect)
            return ["x": rect.origin.x, "y": rect.origin.y, "w": rect.width, "h": rect.height]
        case .cfRange:
            var range = CFRange()
            AXValueGetValue(value, .cfRange, &range)
            return ["location": range.location, "length": range.length]
        default:
            return "<AXValue>"
        }
    }

    return "<\(CFCopyTypeIDDescription(typeID) as String? ?? "unknown")>"
}

final class Walker {
    let maxDepth: Int
    let maxNodes: Int
    let allAttributes: Bool
    // stubbed here because they are walked separately below
    let excludeRoles: Set<String>
    private(set) var nodeCount = 0
    private(set) var truncated = false

    init(maxDepth: Int, maxNodes: Int, allAttributes: Bool, excludeRoles: Set<String> = []) {
        self.maxDepth = maxDepth
        self.maxNodes = maxNodes
        self.allAttributes = allAttributes
        self.excludeRoles = excludeRoles
    }

    func walk(_ element: AXUIElement, depth: Int = 0) -> [String: Any] {
        if nodeCount >= maxNodes {
            truncated = true
            return ["truncated": "maxNodes"]
        }

        let role = stringAttribute(element, attrRole)
        if depth > 0, let role, excludeRoles.contains(role) {
            return ["role": role, "walkedSeparately": true]
        }

        let id = nodeCount
        nodeCount += 1

        var node: [String: Any] = ["id": id]
        let names = attributeNames(element)
        node["attrs"] = names

        if let role { node["role"] = role }
        let subrole = stringAttribute(element, attrSubrole)
        if let subrole { node["subrole"] = subrole }
        if let title = stringAttribute(element, attrTitle), !title.isEmpty { node["title"] = title }
        if let text = stringAttribute(element, attrDescription), !text.isEmpty { node["desc"] = text }
        if let help = stringAttribute(element, attrHelp), !help.isEmpty { node["help"] = help }
        if let identifier = stringAttribute(element, kAXIdentifierAttribute as String), !identifier.isEmpty {
            node["identifier"] = identifier
        }
        if let enabled = boolAttribute(element, attrEnabled) { node["enabled"] = enabled }
        if let focused = boolAttribute(element, attrFocused), focused { node["focused"] = true }

        // never record a password field
        if subrole == "AXSecureTextField" {
            node["value"] = "<redacted>"
        } else if let raw = copyValue(element, attrValue) {
            node["value"] = describe(raw)
        }

        if let box = frame(of: element) { node["frame"] = box }

        // bare strings, no Swift constant. see docs/ax-findings.md
        if role == "AXMenuItem" {
            if let raw = copyValue(element, "AXMenuItemCmdChar"), let char = raw as? String, !char.isEmpty {
                node["cmdChar"] = char
            }
            if let raw = copyValue(element, "AXMenuItemCmdModifiers"), let mods = raw as? NSNumber {
                node["cmdModifiers"] = mods.intValue
            }
            if let raw = copyValue(element, "AXMenuItemCmdVirtualKey"), let key = raw as? NSNumber {
                node["cmdVirtualKey"] = key.intValue
            }
        }

        let actions = actionNames(element)
        if !actions.isEmpty { node["actions"] = actions }

        if allAttributes {
            var extras: [String: Any] = [:]
            for name in names where !expensiveAttributes.contains(name) {
                if let raw = copyValue(element, name) { extras[name] = describe(raw) }
            }
            if !extras.isEmpty { node["attrValues"] = extras }
        }

        if depth >= maxDepth {
            truncated = true
            node["truncated"] = "maxDepth"
            return node
        }

        let kids = children(of: element)
        if !kids.isEmpty {
            node["children"] = kids.map { walk($0, depth: depth + 1) }
        }

        return node
    }
}

func jsonInt(_ value: Any?) -> Int? {
    if let number = value as? Int { return number }
    if let number = value as? NSNumber { return number.intValue }
    return nil
}

func processPath() -> String {
    var size = UInt32(PATH_MAX)
    var buffer = [CChar](repeating: 0, count: Int(PATH_MAX))
    guard _NSGetExecutablePath(&buffer, &size) == 0 else { return CommandLine.arguments[0] }
    return URL(fileURLWithPath: String(cString: buffer)).resolvingSymlinksInPath().path
}

func runningApps() -> [NSRunningApplication] {
    NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }
}

var ignoredPids: Set<pid_t> = [getpid(), getppid()]
var lastForeignPid: pid_t?
var currentReplyId: Any?

func isIgnored(_ pid: pid_t) -> Bool {
    ignoredPids.contains(pid)
}

func rememberForeign(_ app: NSRunningApplication) {
    guard app.activationPolicy == .regular, !isIgnored(app.processIdentifier) else { return }
    lastForeignPid = app.processIdentifier
}

func frontmostPid() -> pid_t? {
    if let app = NSWorkspace.shared.frontmostApplication, !isIgnored(app.processIdentifier) {
        return app.processIdentifier
    }
    if let pid = lastForeignPid, NSRunningApplication(processIdentifier: pid) != nil {
        return pid
    }

    let system = AXUIElementCreateSystemWide()
    guard let raw = copyValue(system, attrFocusedApp),
          CFGetTypeID(raw) == AXUIElementGetTypeID()
    else { return nil }

    var pid: pid_t = 0
    guard AXUIElementGetPid(raw as! AXUIElement, &pid) == .success, !isIgnored(pid) else { return nil }
    return pid
}

func appInfo(for pid: pid_t) -> [String: Any] {
    guard let app = NSRunningApplication(processIdentifier: pid) else { return ["pid": Int(pid)] }
    return [
        "pid": Int(pid),
        "name": app.localizedName ?? "unknown",
        "bundleId": app.bundleIdentifier ?? "unknown",
        "active": app.isActive,
    ]
}

func emit(_ object: [String: Any]) {
    var object = object
    if let currentReplyId { object["id"] = currentReplyId }
    if let data = try? JSONSerialization.data(withJSONObject: object),
       let line = String(data: data, encoding: .utf8) {
        print(line)
    } else {
        print("{\"ok\":false,\"error\":\"could not serialise response\"}")
    }
    fflush(stdout)
}

func resolveTarget(_ request: [String: Any]) -> pid_t? {
    if let requested = jsonInt(request["pid"]) { return pid_t(requested) }
    if let bundleId = request["bundleId"] as? String {
        return runningApps().first { $0.bundleIdentifier == bundleId }?.processIdentifier
    }
    return frontmostPid()
}

func handleEnable(_ request: [String: Any]) {
    guard AXIsProcessTrusted() else {
        emit(["ok": false, "trusted": false, "error": "accessibility permission not granted", "path": processPath()])
        return
    }
    guard let pid = resolveTarget(request) else {
        emit(["ok": false, "error": "could not resolve a target application"])
        return
    }

    let enabled = request["enabled"] as? Bool ?? true
    let value: CFTypeRef = enabled ? kCFBooleanTrue : kCFBooleanFalse
    let appElement = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(appElement, defaultTimeout)

    var results: [String: Any] = [:]
    for attribute in [attrManualAccessibility, attrEnhancedUserInterface] {
        let error = AXUIElementSetAttributeValue(appElement, attribute as CFString, value)
        results[attribute] = error == .success ? "ok" : "AXError \(error.rawValue)"
    }

    emit(["ok": true, "app": appInfo(for: pid), "enabled": enabled, "results": results])
}

func handleDump(_ request: [String: Any]) {
    guard AXIsProcessTrusted() else {
        emit(["ok": false, "trusted": false, "error": "accessibility permission not granted", "path": processPath()])
        return
    }

    guard let pid = resolveTarget(request) else {
        emit(["ok": false, "error": "could not resolve a target application"])
        return
    }

    let maxDepth = jsonInt(request["maxDepth"]) ?? defaultMaxDepth
    let maxNodes = jsonInt(request["maxNodes"]) ?? defaultMaxNodes
    let timeout = (request["timeoutSeconds"] as? NSNumber)?.floatValue ?? defaultTimeout
    let allAttributes = request["allAttributes"] as? Bool ?? false

    let appElement = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(appElement, timeout)

    let started = Date()
    let walker = Walker(
        maxDepth: maxDepth,
        maxNodes: maxNodes,
        allAttributes: allAttributes,
        excludeRoles: [attrMenuBarRole, attrWindowRole]
    )

    let root = walker.walk(appElement)

    var windows: [[String: Any]] = []
    if let raw = copyValue(appElement, attrWindows), let list = raw as? [AXUIElement] {
        windows = list.map { walker.walk($0) }
    }

    var menuBar: Any = NSNull()
    if let raw = copyValue(appElement, attrMenuBar), CFGetTypeID(raw) == AXUIElementGetTypeID() {
        menuBar = walker.walk(raw as! AXUIElement)
    }

    emit([
        "ok": true,
        "trusted": true,
        "app": appInfo(for: pid),
        "nodeCount": walker.nodeCount,
        "truncated": walker.truncated,
        "elapsedMs": Int(Date().timeIntervalSince(started) * 1000),
        "root": root,
        "windows": windows,
        "menuBar": menuBar,
    ])
}

func handle(_ line: String) {
    guard let data = line.data(using: .utf8),
          let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
        emit(["ok": false, "error": "expected a JSON object with a cmd field"])
        return
    }

    currentReplyId = request["id"]
    defer { currentReplyId = nil }

    guard let cmd = request["cmd"] as? String else {
        emit(["ok": false, "error": "expected a JSON object with a cmd field"])
        return
    }

    switch cmd {
    case "ping":
        emit([
            "ok": true,
            "cmd": "ping",
            "trusted": AXIsProcessTrusted(),
            "path": processPath(),
            "pid": Int(getpid()),
            "ppid": Int(getppid()),
        ])

    case "permission":
        let shouldPrompt = request["prompt"] as? Bool ?? false
        if shouldPrompt {
            let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
            let trusted = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
            emit(["ok": true, "trusted": trusted, "prompted": true, "path": processPath()])
        } else {
            emit(["ok": true, "trusted": AXIsProcessTrusted(), "prompted": false, "path": processPath()])
        }

    case "apps":
        emit(["ok": true, "apps": runningApps().map { appInfo(for: $0.processIdentifier) }])

    case "frontmost":
        if let pid = frontmostPid() {
            emit(["ok": true, "app": appInfo(for: pid)])
        } else {
            emit(["ok": false, "error": "could not resolve a target application"])
        }

    case "enable":
        handleEnable(request)

    case "dump":
        handleDump(request)

    default:
        emit(["ok": false, "error": "unknown cmd: \(cmd)"])
    }
}

setvbuf(stdout, nil, _IOLBF, 0)

if let app = NSWorkspace.shared.frontmostApplication {
    rememberForeign(app)
}

NSWorkspace.shared.notificationCenter.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification,
    object: nil,
    queue: .main
) { notification in
    guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
    rememberForeign(app)
}

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { continue }
        DispatchQueue.main.sync { handle(trimmed) }
    }
    exit(0)
}

RunLoop.main.run()
