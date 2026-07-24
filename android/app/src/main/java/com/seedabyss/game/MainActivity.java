package com.seedabyss.game;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Immersive fullscreen: hide status bar + navigation bar for gameplay.
 */
public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Must be before super for window flags on some Android versions.
    requestWindowFeature(Window.FEATURE_NO_TITLE);
    super.onCreate(savedInstanceState);
    applyImmersive();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) {
      applyImmersive();
    }
  }

  @Override
  public void onResume() {
    super.onResume();
    applyImmersive();
  }

  private void applyImmersive() {
    Window window = getWindow();
    if (window == null) return;

    // Draw edge-to-edge under system bars, then hide them.
    WindowCompat.setDecorFitsSystemWindows(window, false);
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    window.setStatusBarColor(Color.TRANSPARENT);
    window.setNavigationBarColor(Color.TRANSPARENT);

    View decor = window.getDecorView();
    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(window, decor);
    if (controller != null) {
      controller.hide(WindowInsetsCompat.Type.statusBars());
      controller.hide(WindowInsetsCompat.Type.navigationBars());
      controller.setSystemBarsBehavior(
          WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      );
    }

    // Legacy fallback for older devices / WebView quirks.
    int flags =
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
    decor.setSystemUiVisibility(flags);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      WindowManager.LayoutParams lp = window.getAttributes();
      lp.layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      window.setAttributes(lp);
    }
  }
}
