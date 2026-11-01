import ExpoModulesCore
import UIKit

/// One page of the curl: hosts a React Native child view.
final class PageHostController: UIViewController {
  let hostedView: UIView
  var position: Int

  init(hostedView: UIView, position: Int, background: UIColor) {
    self.hostedView = hostedView
    self.position = position
    super.init(nibName: nil, bundle: nil)
    view.backgroundColor = background
    view.clipsToBounds = true
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    if hostedView.superview !== view { view.addSubview(hostedView) }
    hostedView.frame = view.bounds
  }
}

/// Container that shows its React children as pages of a UIPageViewController using the
/// page curl transition. Children are mounted by Fabric and re-parented into page controllers.
public final class TamdokPageCurlView: ExpoView, UIPageViewControllerDataSource, UIPageViewControllerDelegate {
  let onPageSelected = EventDispatcher()

  var targetIndex = 0
  var animatedCommand = false
  var commandNonce = 0
  var rtl = false {
    didSet { if rtl != oldValue { needsRebuild = true } }
  }
  var scrollEnabled = true {
    didSet {
      guard scrollEnabled != oldValue else { return }
      pager.gestureRecognizers.forEach { if !($0 is UITapGestureRecognizer) { $0.isEnabled = scrollEnabled } }
    }
  }
  var pageBackgroundColor: UIColor = .black {
    didSet {
      backgroundColor = pageBackgroundColor
      controllers.values.forEach { $0.view.backgroundColor = pageBackgroundColor }
    }
  }

  private let pager: UIPageViewController
  private var pageViews: [UIView] = []
  private var controllers: [ObjectIdentifier: PageHostController] = [:]
  private var ordered: [PageHostController] = []
  private var current = -1
  private var appliedNonce = -1
  private var needsRebuild = false
  private var rebuildScheduled = false
  private var isTransitioning = false

  public required init(appContext: AppContext? = nil) {
    pager = UIPageViewController(
      transitionStyle: .pageCurl,
      navigationOrientation: .horizontal,
      options: [.spineLocation: UIPageViewController.SpineLocation.min.rawValue]
    )
    super.init(appContext: appContext)
    clipsToBounds = true
    pager.isDoubleSided = false
    pager.dataSource = self
    pager.delegate = self
    addSubview(pager.view)
    // Taps are handled by the reader (tap zones); the built-in edge taps would turn pages on their own.
    pager.gestureRecognizers.forEach { if $0 is UITapGestureRecognizer { $0.isEnabled = false } }
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil, pager.parent == nil, let parent = parentViewController() else { return }
    parent.addChild(pager)
    pager.didMove(toParent: parent)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    pager.view.frame = bounds
  }

  private func parentViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let controller = next as? UIViewController { return controller }
      responder = next
    }
    return nil
  }

  // MARK: Children

  public override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    pageViews.insert(childComponentView, at: min(max(index, 0), pageViews.count))
    scheduleRebuild()
  }

  public override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    // React Native asserts that an unmounted child has no superview.
    childComponentView.removeFromSuperview()
    pageViews.removeAll { $0 === childComponentView }
    controllers.removeValue(forKey: ObjectIdentifier(childComponentView))
    scheduleRebuild()
  }

  private func scheduleRebuild() {
    needsRebuild = true
    if rebuildScheduled { return }
    rebuildScheduled = true
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.rebuildScheduled = false
      self.applyPendingUpdates()
    }
  }

  // MARK: Updates

  func applyPendingUpdates() {
    if needsRebuild {
      needsRebuild = false
      rebuild()
    }
    // Children may not be mounted yet on the first update; keep the command pending until they are.
    if commandNonce != appliedNonce, show(index: targetIndex, animated: animatedCommand) {
      appliedNonce = commandNonce
    }
  }

  private func rebuild() {
    ordered = pageViews.enumerated().map { offset, view in
      let key = ObjectIdentifier(view)
      let controller = controllers[key]
        ?? PageHostController(hostedView: view, position: offset, background: pageBackgroundColor)
      controller.position = offset
      controllers[key] = controller
      return controller
    }
    guard !ordered.isEmpty else { return }
    let index = min(max(current, 0), ordered.count - 1)
    if current < 0 { return } // The first show() places the initial page.
    current = index
    pager.setViewControllers([ordered[index]], direction: .forward, animated: false)
  }

  private func controller(at index: Int) -> PageHostController? {
    index >= 0 && index < ordered.count ? ordered[index] : nil
  }

  @discardableResult
  private func show(index: Int, animated: Bool) -> Bool {
    guard let target = controller(at: index) else { return false }
    if index == current && pager.viewControllers?.first === target { return true }
    let isInitial = current < 0
    let goesForward = index >= current
    // For right-to-left reading, a later page curls in from the left edge.
    let direction: UIPageViewController.NavigationDirection = (goesForward != rtl) ? .forward : .reverse
    let shouldAnimate = animated && !isInitial && !isTransitioning && window != nil
    current = index
    if shouldAnimate {
      isTransitioning = true
      pager.setViewControllers([target], direction: direction, animated: true) { [weak self] _ in
        self?.isTransitioning = false
      }
    } else {
      pager.setViewControllers([target], direction: direction, animated: false)
    }
    if !isInitial { onPageSelected(["position": index]) }
    return true
  }

  // MARK: UIPageViewControllerDataSource

  public func pageViewController(
    _ pageViewController: UIPageViewController,
    viewControllerBefore viewController: UIViewController
  ) -> UIViewController? {
    guard let host = viewController as? PageHostController else { return nil }
    return controller(at: rtl ? host.position + 1 : host.position - 1)
  }

  public func pageViewController(
    _ pageViewController: UIPageViewController,
    viewControllerAfter viewController: UIViewController
  ) -> UIViewController? {
    guard let host = viewController as? PageHostController else { return nil }
    return controller(at: rtl ? host.position - 1 : host.position + 1)
  }

  // MARK: UIPageViewControllerDelegate

  public func pageViewController(
    _ pageViewController: UIPageViewController,
    willTransitionTo pendingViewControllers: [UIViewController]
  ) {
    isTransitioning = true
  }

  public func pageViewController(
    _ pageViewController: UIPageViewController,
    didFinishAnimating finished: Bool,
    previousViewControllers: [UIViewController],
    transitionCompleted completed: Bool
  ) {
    isTransitioning = false
    guard completed, let host = pageViewController.viewControllers?.first as? PageHostController else { return }
    if host.position != current {
      current = host.position
      onPageSelected(["position": host.position])
    }
  }
}
