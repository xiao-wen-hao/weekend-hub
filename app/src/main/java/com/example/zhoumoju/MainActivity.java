package com.example.zhoumoju;

import android.os.Bundle;
import android.content.Intent;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.Spinner;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private EditText baseUrl,username,password,circleName,joinCode;
    private TextView status;
    private LinearLayout circles;
    private String cookie="";
    interface Done { void accept(JSONObject result) throws Exception; }
    @Override protected void onCreate(Bundle state){super.onCreate(state);setContentView(R.layout.activity_main);
        baseUrl=findViewById(R.id.baseUrl);username=findViewById(R.id.username);password=findViewById(R.id.password);circleName=findViewById(R.id.circleName);joinCode=findViewById(R.id.joinCode);status=findViewById(R.id.status);circles=findViewById(R.id.circles);
        findViewById(R.id.login).setOnClickListener(v->auth(false));findViewById(R.id.register).setOnClickListener(v->auth(true));
        findViewById(R.id.createCircle).setOnClickListener(v->request("POST","/api/circles",json("name",circleName.getText().toString()),x->refresh()));
        findViewById(R.id.joinCircle).setOnClickListener(v->request("POST","/api/circles/join",json("code",joinCode.getText().toString()),x->refresh()));
        findViewById(R.id.refresh).setOnClickListener(v->refresh());
        findViewById(R.id.discussions).setOnClickListener(v->openDiscussion(null));
    }
    private JSONObject json(String key,Object value){JSONObject x=new JSONObject();try{x.put(key,value);}catch(Exception ignored){}return x;}
    private void auth(boolean register){JSONObject body=json("username",username.getText().toString());try{body.put("password",password.getText().toString());if(register)body.put("name",username.getText().toString());}catch(Exception ignored){}request("POST",register?"/api/register":"/api/login",body,x->{status.setText("已登录："+x.getJSONObject("user").getString("name"));refresh();});}
    private void request(String method,String path,JSONObject body,Done done){io.execute(()->{try{
        URL url=new URL(baseUrl.getText().toString().replaceAll("/$","")+path);HttpURLConnection conn=(HttpURLConnection)url.openConnection();conn.setRequestMethod(method);conn.setConnectTimeout(10000);conn.setReadTimeout(15000);if(!cookie.isEmpty())conn.setRequestProperty("Cookie",cookie);
        if(body!=null){conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json; charset=utf-8");try(OutputStream out=conn.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
        String setCookie=conn.getHeaderField("Set-Cookie");if(setCookie!=null)cookie=setCookie.split(";",2)[0];
        int code=conn.getResponseCode();InputStream stream=code>=400?conn.getErrorStream():conn.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] chunk=new byte[4096];int count;while((count=stream.read(chunk))!=-1)bytes.write(chunk,0,count);String raw=bytes.toString("UTF-8");conn.disconnect();JSONObject result=new JSONObject(raw);
        runOnUiThread(()->{try{if(code>=400)status.setText(result.optString("error","请求失败 "+code));else done.accept(result);}catch(Exception e){status.setText(e.getMessage());}});
    }catch(Exception e){runOnUiThread(()->status.setText("连接失败："+e.getMessage()));}});}
    private void refresh(){request("GET","/api/circles",null,result->{circles.removeAllViews();JSONArray list=result.getJSONArray("circles");if(list.length()==0)addText(circles,"还没有圈子。先创建一个，再邀请朋友加入。");for(int i=0;i<list.length();i++)showCircle(list.getJSONObject(i));});}
    private void showCircle(JSONObject item)throws Exception {String id=item.getString("id");addText(circles,item.getString("name")+"  邀请码："+item.getString("joinCode"));EditText thought=new EditText(this);thought.setHint("比如：周六下午想打桌游");circles.addView(thought);
        String[] categories={"待确认","桌游","KTV","剧本杀","密室逃脱","电影","保龄球","逛街","散步聊天","火锅","烤肉","川菜","湘菜","日料","粤菜","西餐","简餐"};String[] windows={"时间待确认","上午","中午","下午","晚上"};String[] values={"","morning","noon","afternoon","evening"};
        Spinner category=new Spinner(this);category.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,categories));circles.addView(category);Spinner time=new Spinner(this);time.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,windows));circles.addView(time);
        Button preview=button("看看系统理解得对吗",circles);preview.setOnClickListener(v->request("POST","/api/intents/preview",json("text",thought.getText().toString()),x->{String guess=x.optString("category","");for(int j=1;j<categories.length;j++)if(categories[j].equals(guess))category.setSelection(j);String window=x.optString("windowId","");for(int j=1;j<values.length;j++)if(values[j].equals(window))time.setSelection(j);status.setText("请核对下面的活动和时段；不确定可保持待确认。");}));
        CheckBox matchAllowed=new CheckBox(this);matchAllowed.setText("允许在这个熟人圈内匹配");circles.addView(matchAllowed);CheckBox contactAllowed=new CheckBox(this);contactAllowed.setText("允许针对候选局私下询问我");circles.addView(contactAllowed);
        Button send=button("确认投递",circles);send.setOnClickListener(v->{JSONObject body=json("text",thought.getText().toString());try{body.put("category",category.getSelectedItemPosition()==0?JSONObject.NULL:categories[category.getSelectedItemPosition()]);body.put("windowId",time.getSelectedItemPosition()==0?JSONObject.NULL:values[time.getSelectedItemPosition()]);body.put("matchAllowed",matchAllowed.isChecked());body.put("contactAllowed",contactAllowed.isChecked());}catch(Exception ignored){}request("POST","/api/circles/"+id+"/intents",body,x->{status.setText("意愿已保存");refresh();});});
        loadCircle(id);
    }
    private void loadCircle(String id){request("GET","/api/circles/"+id+"/intents",null,x->{JSONArray arr=x.getJSONArray("intents");for(int i=0;i<arr.length();i++){JSONObject intent=arr.getJSONObject(i);LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);circles.addView(row);addText(row,"意愿："+intent.getString("rawText")+"  "+intent.getString("status"));if("active".equals(intent.getString("status"))){Button withdraw=button("撤回",row);withdraw.setOnClickListener(v->request("POST","/api/intents/"+intent.optString("id")+"/withdraw",new JSONObject(),z->refresh()));}}});
        request("GET","/api/circles/"+id+"/candidates",null,x->{JSONArray arr=x.getJSONArray("candidates");for(int i=0;i<arr.length();i++){JSONObject c=arr.getJSONObject(i);addText(circles,"候选局："+c.getString("category")+" / "+c.getString("windowId")+" · "+c.getInt("yesCount")+" 人愿意讨论");if("probing".equals(c.getString("status"))){Button yes=button("愿意讨论",circles);yes.setOnClickListener(v->request("POST","/api/candidates/"+c.optString("id")+"/respond",json("decision","yes"),z->refresh()));Button open=button("三人同意后开局",circles);open.setOnClickListener(v->request("POST","/api/candidates/"+c.optString("id")+"/open",new JSONObject(),z->{status.setText("讨论间已创建");openDiscussion(z.getString("roomId"));}));}else if("opened".equals(c.getString("status"))){Button go=button("进入讨论间",circles);go.setOnClickListener(v->openDiscussion(c.optString("roomId")));}}});
    }
    private void openDiscussion(String roomId){Intent intent=new Intent(this,DiscussionActivity.class);intent.putExtra("base",baseUrl.getText().toString().replaceAll("/$",""));intent.putExtra("cookie",cookie);if(roomId!=null)intent.putExtra("room",roomId);startActivity(intent);}
    private void addText(LinearLayout parent,String text){TextView view=new TextView(this);view.setText(text);view.setTextSize(16);view.setPadding(0,12,0,8);parent.addView(view);}
    private Button button(String text,LinearLayout parent){Button b=new Button(this);b.setText(text);parent.addView(b);return b;}
    @Override protected void onDestroy(){super.onDestroy();io.shutdownNow();}
}
