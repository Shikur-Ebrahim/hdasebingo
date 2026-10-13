declare global {
  interface Window {
    Telegram: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: { id: number; first_name: string; last_name?: string; username?: string; };
          start_param?: string;
        };
        ready(): void;
        expand(): void;
        close(): void;
        colorScheme: 'light' | 'dark';
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          show(): void;
          hide(): void;
          enable(): void;
          disable(): void;
          onClick(fn: () => void): void;
          offClick(fn: () => void): void;
          showProgress(leaveActive: boolean): void;
          hideProgress(): void;
        };
        BackButton: {
          isVisible: boolean;
          show(): void;
          hide(): void;
          onClick(fn: () => void): void;
          offClick(fn: () => void): void;
        };
        HapticFeedback: {
          impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
          notificationOccurred(type: 'error' | 'success' | 'warning'): void;
          selectionChanged(): void;
        };
        showAlert(message: string, callback?: () => void): void;
        showPopup(params: { title?: string; message: string; buttons?: {type: string; text?: string; id?: string}[] }, callback?: (id: string) => void): void;
      };
    };
  }
}

export const tg = typeof window !== 'undefined' && window.Telegram?.WebApp ? window.Telegram.WebApp : null;
export const getTelegramUser = () => tg?.initDataUnsafe?.user ?? null;
export const getInitData = () => tg?.initData ?? '';
export const getStartParam = () => tg?.initDataUnsafe?.start_param ?? null;
