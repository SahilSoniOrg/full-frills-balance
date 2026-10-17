import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

/// Owns OS import/export. No app-owned secret file, URI or bytes cross the JS bridge.
final class RecoveryFilePicker: NSObject, UIDocumentPickerDelegate,
  UIAdaptivePresentationControllerDelegate
{
  private var promise: Promise?
  private var credential: String?
  private var selected: URL?
  private var scoped = false
  private var allowed = false
  private var observer: NSObjectProtocol?
  override init() {
    super.init()
    observer = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.finishImport() }
  }
  deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }
  func setAllowed(_ value: Bool) {
    allowed = value
    if value { finishImport() }
  }
  private func finishImport() {
    guard allowed, UIApplication.shared.applicationState == .active, let selected else { return }
    do { finish(try FFBKeyCrypto.importCredential(selected.absoluteString)) } catch { fail(error) }
  }
  func pick(from presenter: UIViewController, promise: Promise) throws {
    guard self.promise == nil else { throw NSError(domain: "FFB_KEY_OPERATION_FAILED", code: 1) }
    let picker = UIDocumentPickerViewController(
      forOpeningContentTypes: [.json, .plainText, .data], asCopy: false)
    self.promise = promise
    present(picker, from: presenter)
  }

  func export(_ handle: String, from presenter: UIViewController, promise: Promise) throws {
    guard self.promise == nil else { throw NSError(domain: "FFB_KEY_OPERATION_FAILED", code: 1) }
    try FFBKeyCrypto.retainCredential(handle)
    do {
      let metadata = try JSONSerialization.jsonObject(with: Data(handle.utf8)) as? [String: Any]
      guard let purpose = metadata?["purpose"] as? String,
        ["user-recovery", "workplace-dump"].contains(purpose)
      else { throw NSError(domain: "FFB_KEY_INVALID_FILE", code: 1) }
      let provider = NSItemProvider()
      provider.suggestedName = "full-frills-\(purpose)-secret.json"
      // The OS requests data only for the user's chosen share action. No app cache file exists.
      provider.registerDataRepresentation(
        forTypeIdentifier: UTType.json.identifier, visibility: .all
      ) { completion in
        do {
          let data = try FFBKeyCrypto.credentialData(handle)
          defer { data.resetBytes(in: NSRange(location: 0, length: data.length)) }
          completion(Data(bytes: data.bytes, count: data.length), nil)
        } catch { completion(nil, error) }
        return nil
      }
      credential = handle
      self.promise = promise
      let controller = UIActivityViewController(
        activityItemsConfiguration: UIActivityItemsConfiguration(itemProviders: [provider]))
      controller.excludedActivityTypes = [
        .copyToPasteboard, .print, .assignToContact, .addToReadingList,
      ]
      controller.completionWithItemsHandler = { [weak self] _, completed, _, error in
        if let error { self?.fail(error) } else { self?.finish(completed) }
      }
      if let popover = controller.popoverPresentationController {
        popover.sourceView = presenter.view
        popover.sourceRect = CGRect(
          x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
      }
      presenter.present(controller, animated: true)
    } catch {
      try? FFBKeyCrypto.releaseCredential(handle)
      throw error
    }
  }

  private func present(_ picker: UIDocumentPickerViewController, from presenter: UIViewController) {
    picker.delegate = self
    picker.allowsMultipleSelection = false
    presenter.present(picker, animated: true)
    picker.presentationController?.delegate = self
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL])
  {
    guard let url = urls.first else {
      finish(nil)
      return
    }
    if credential != nil {
      finish(true)
      return
    }
    selected = url
    scoped = url.startAccessingSecurityScopedResource()
    finishImport()
  }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(credential == nil ? nil : false)
  }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    if selected != nil { finishImport() } else { finish(credential == nil ? nil : false) }
  }
  func cancel() {
    fail(NSError(domain: "FFB_KEY_CANCELLED", code: 1))
  }
  private func cleanup() {
    if scoped { selected?.stopAccessingSecurityScopedResource() }
    selected = nil
    scoped = false
    if let credential { try? FFBKeyCrypto.releaseCredential(credential) }
    credential = nil
    promise = nil
  }
  private func finish(_ result: Any?) {
    let pending = promise
    cleanup()
    pending?.resolve(result)
  }
  private func fail(_ error: Error) {
    let pending = promise
    cleanup()
    pending?.reject(error)
  }
}
