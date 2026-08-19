import ActivityKit
import Foundation

struct LibraryRefreshAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var title: String
    var subtitle: String
    var current: Int
    var total: Int

    var progress: Double {
      guard total > 0 else { return 0 }
      return min(1, Double(current) / Double(total))
    }
  }
}
