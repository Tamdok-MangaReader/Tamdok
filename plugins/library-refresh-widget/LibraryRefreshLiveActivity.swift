import ActivityKit
import SwiftUI
import WidgetKit

@main
struct LibraryRefreshBundle: WidgetBundle {
  var body: some Widget {
    LibraryRefreshLiveActivity()
  }
}

struct LibraryRefreshLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LibraryRefreshAttributes.self) { context in
      lockScreen(context: context)
        .activityBackgroundTint(Color.black.opacity(0.88))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "books.vertical.fill")
            .foregroundStyle(.white)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text("\(context.state.current)/\(context.state.total)")
            .font(.headline.monospacedDigit())
            .foregroundStyle(.white)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            Text(context.state.title)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(.white)
            Text(context.state.subtitle)
              .font(.caption)
              .foregroundStyle(.white.opacity(0.7))
              .lineLimit(1)
            ProgressView(value: context.state.progress)
              .tint(.white)
          }
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        ProgressView(value: context.state.progress)
          .progressViewStyle(.circular)
          .tint(.white)
      } compactTrailing: {
        Image(systemName: "books.vertical.fill")
          .foregroundStyle(.white)
      } minimal: {
        ProgressView(value: context.state.progress)
          .progressViewStyle(.circular)
          .tint(.white)
      }
    }
  }

  @ViewBuilder
  private func lockScreen(context: ActivityViewContext<LibraryRefreshAttributes>) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 10) {
        Image(systemName: "books.vertical.fill")
          .foregroundStyle(.white)
        VStack(alignment: .leading, spacing: 2) {
          Text(context.state.title)
            .font(.headline)
            .foregroundStyle(.white)
          Text(context.state.subtitle)
            .font(.subheadline)
            .foregroundStyle(.white.opacity(0.7))
            .lineLimit(1)
        }
        Spacer()
        Text("\(context.state.current)/\(context.state.total)")
          .font(.headline.monospacedDigit())
          .foregroundStyle(.white)
      }
      ProgressView(value: context.state.progress)
        .tint(.white)
    }
    .padding(16)
  }
}
