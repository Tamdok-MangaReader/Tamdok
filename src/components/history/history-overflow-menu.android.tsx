import { AndroidPopupMenu } from '@/components/ui/android-popup-menu';
import { t } from '@/constants/locales';

type HistoryOverflowMenuProps = {
  onClearToday: () => void;
  onClearWeek: () => void;
  onClearAll: () => void;
};

export function HistoryOverflowMenu({ onClearToday, onClearWeek, onClearAll }: HistoryOverflowMenuProps) {
  return (
    <AndroidPopupMenu
      accessibilityLabel={t('history_menu')}
      items={[
        { key: 'today', label: t('history_clear_today'), icon: 'calendar-outline', destructive: true, onPress: onClearToday },
        { key: 'week', label: t('history_clear_week'), icon: 'time-outline', destructive: true, onPress: onClearWeek },
        { key: 'all', label: t('history_clear_all'), icon: 'trash-outline', destructive: true, onPress: onClearAll },
      ]}
    />
  );
}
