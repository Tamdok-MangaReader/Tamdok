import ExpoModulesCore

public class TamdokPageCurlModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TamdokPageCurl")

    View(TamdokPageCurlView.self) {
      Events("onPageSelected")

      Prop("targetIndex") { (view: TamdokPageCurlView, value: Int) in
        view.targetIndex = value
      }
      Prop("animated") { (view: TamdokPageCurlView, value: Bool) in
        view.animatedCommand = value
      }
      Prop("commandNonce") { (view: TamdokPageCurlView, value: Int) in
        view.commandNonce = value
      }
      Prop("rtl") { (view: TamdokPageCurlView, value: Bool) in
        view.rtl = value
      }
      Prop("scrollEnabled") { (view: TamdokPageCurlView, value: Bool) in
        view.scrollEnabled = value
      }
      Prop("pageBackgroundColor") { (view: TamdokPageCurlView, value: UIColor?) in
        view.pageBackgroundColor = value ?? .black
      }

      OnViewDidUpdateProps { (view: TamdokPageCurlView) in
        view.applyPendingUpdates()
      }
    }
  }
}
