package com.example.zhoumoju;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

public class DiscussionActivity extends AppCompatActivity {
    private WebView web;
    @Override protected void onCreate(Bundle saved){super.onCreate(saved);web=new WebView(this);setContentView(web);
        String base=getIntent().getStringExtra("base");if(base==null||base.isEmpty()){finish();return;}
        String cookie=getIntent().getStringExtra("cookie");CookieManager.getInstance().setAcceptCookie(true);if(cookie!=null&&!cookie.isEmpty())CookieManager.getInstance().setCookie(base,cookie);CookieManager.getInstance().flush();
        web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.setWebViewClient(new WebViewClient());
        String room=getIntent().getStringExtra("room");web.loadUrl(base+(room==null?"/":"/?room="+room));
    }
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
