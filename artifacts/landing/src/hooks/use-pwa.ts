import { useState, useEffect } from 'react';

export type PwaPlatform = 'ios' | 'android' | 'desktop';

// Extend the Window interface for the BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let capturedPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(event: BeforeInstallPromptEvent) => void>();

function detectPlatform(): PwaPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const userAgent = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  const isAndroid = /Android/i.test(userAgent);
  return isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
}

function waitForInstallPrompt(timeoutMs: number): Promise<BeforeInstallPromptEvent | null> {
  if (capturedPrompt) return Promise.resolve(capturedPrompt);
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      promptListeners.delete(onPrompt);
      resolve(null);
    }, timeoutMs);

    const onPrompt = (event: BeforeInstallPromptEvent) => {
      window.clearTimeout(timeout);
      promptListeners.delete(onPrompt);
      resolve(event);
    };

    promptListeners.add(onPrompt);
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    capturedPrompt = event;
    promptListeners.forEach((listener) => listener(event));
  });

  window.addEventListener('appinstalled', () => {
    capturedPrompt = null;
  });
}

export function usePwa() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<PwaPlatform>(() => detectPlatform());

  useEffect(() => {
    setPlatform(detectPlatform());

    if (capturedPrompt) {
      setDeferredPrompt(capturedPrompt);
      setIsInstallable(true);
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      capturedPrompt = e;
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      capturedPrompt = null;
      setDeferredPrompt(null);
      setIsInstallable(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async (timeoutMs = 1500): Promise<boolean> => {
    const prompt = deferredPrompt ?? capturedPrompt ?? await waitForInstallPrompt(timeoutMs);
    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
        setIsInstalled(true);
      }
      capturedPrompt = null;
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable,
    isInstalled,
    promptInstall,
    platform,
    isIOS: platform === 'ios',
    isAndroid: platform === 'android',
    isDesktop: platform === 'desktop',
  };
}
