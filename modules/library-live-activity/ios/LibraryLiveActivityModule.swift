import ActivityKit
import ExpoModulesCore

public class LibraryLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LibraryLiveActivity")

    AsyncFunction("start") { (title: String, subtitle: String, current: Int, total: Int) async throws -> String? in
      guard #available(iOS 16.2, *) else { return nil }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

      await Self.endExisting()

      let state = LibraryRefreshAttributes.ContentState(
        title: title,
        subtitle: subtitle,
        current: current,
        total: total
      )

      let activity = try Activity.request(
        attributes: LibraryRefreshAttributes(),
        content: ActivityContent(state: state, staleDate: nil),
        pushType: nil
      )
      return activity.id
    }

    AsyncFunction("update") { (id: String, title: String, subtitle: String, current: Int, total: Int) async in
      guard #available(iOS 16.2, *) else { return }

      let state = LibraryRefreshAttributes.ContentState(
        title: title,
        subtitle: subtitle,
        current: current,
        total: total
      )

      for activity in Activity<LibraryRefreshAttributes>.activities where activity.id == id {
        await activity.update(ActivityContent(state: state, staleDate: nil))
      }
    }

    AsyncFunction("end") { (id: String) async in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<LibraryRefreshAttributes>.activities where activity.id == id {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  @available(iOS 16.2, *)
  private static func endExisting() async {
    for activity in Activity<LibraryRefreshAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}
