const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const results = [];
  const config = { title: 'College Consultant', pipeline: 'gemini', wsUrl: 'wss://voice.example.test/ws', agentId: 'test-agent', minimized: false,
    logo: '', avatars: [{ name: 'about', role: 'College Advisor', avatar: '' }] };
  const server = http.createServer((req, res) => {
    if (req.url === '/widget.js') { res.setHeader('Content-Type','text/javascript'); res.end(fs.readFileSync(process.env.WIDGET_BUNDLE || path.join(root,'dist/voicedots-widget.js'))); }
    else { res.setHeader('Content-Type','text/html'); res.end(`<html><body style="background:#eef1f7"><voicedots-ai config='${JSON.stringify(config)}'></voicedots-ai><script type="module" src="/widget.js"></script></body></html>`); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args:['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport:{width:800,height:800} });
    page.on('pageerror', e=>console.error('BROWSER_ERROR', e.message));
    page.on('console', m=>{if(m.type()==='error') console.error('BROWSER_CONSOLE',m.text())});
    await page.clock.install();
    await page.addInitScript(() => {
      const nativeContext = new window.AudioContext();
      const mockMicrophone = nativeContext.createMediaStreamDestination().stream;
      class Context {
        state='running'; sampleRate=48000; destination={}; audioWorklet={addModule:async()=>{}};
        resume=async()=>{}; close=async()=>{};
        createMediaStreamDestination=()=>({stream:new MediaStream()});
        createMediaStreamSource=()=>({connect:()=>{}});
      }
      window.testMic=null;
      class Worklet { constructor(ctx,name) { if(name==='mic-capture') window.testMic=this; } port={postMessage:()=>{},addEventListener:()=>{},start:()=>{},onmessage:null}; connect=()=>{}; }
      window.AudioContext=Context; window.AudioWorkletNode=Worklet;
      window.Audio=class { play=async()=>{};pause=()=>{};srcObject=null; };
      Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>mockMicrophone.clone()}});
    });
    let used=0, reset=false;
    await page.route('https://voice.example.test/voice/access',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{session_seconds:300,limit:2,window_seconds:3600,remaining:reset?2:Math.max(0,2-used),retry_after_seconds:!reset&&used>=2?3600:0}}));
    await page.routeWebSocket('wss://voice.example.test/ws*',ws=>{
      used++;
      setTimeout(()=>ws.send(JSON.stringify({type:'SessionLimits',session_seconds:300,remaining_session_seconds:300,limit:2,window_seconds:3600,remaining:Math.max(0,2-used),retry_after_seconds:used>=2?3600:0})),30);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('button',{name:"Let's Talk"}).waitFor();
    assert.equal(await page.locator('.vd-access-policy').count(),0);
    assert.equal(await page.locator('.vd-quota-toast').count(),0);
    results.push('PASS no_persistent_quota_panel_or_notice_when_attempts_remain');
    await page.getByRole('button',{name:"Let's Talk"}).click();
    await page.locator('.vd-timer').filter({hasText:'5:00'}).waitFor().catch(async e=>{console.error('VISIBLE_TEXT',await page.locator('.vd-main-card').innerText());throw e});
    assert.equal(await page.locator('.vd-quota-toast').count(),0);
    results.push('PASS first_connection_starts_at_server_300_second_deadline');
    for (let i=0;i<10;i++) {
      await page.clock.runFor(29000);
      await page.evaluate(()=>window.testMic.port.onmessage({data:'user_voice_activity'}));
    }
    assert.equal(await page.getByRole('button',{name:'End Call'}).count(),1);
    results.push('PASS user_voice_keeps_call_alive_until_five_minute_ceiling');
    await page.clock.runFor(11000);
    await page.getByRole('button',{name:"Let's Talk"}).waitFor();
    assert.equal(used,1);
    results.push('PASS elapsed_time_ends_session_even_after_background_time_jump');
    await page.getByRole('button',{name:"Let's Talk"}).click();
    await page.locator('.vd-timer').filter({hasText:'5:00'}).waitFor();
    assert.equal(await page.locator('.vd-quota-toast').count(),0);
    await page.waitForFunction(()=>Number(localStorage.getItem('vd-voice-retry:https://voice.example.test/voice/access')) > Date.now());
    results.push('PASS reconnect_resets_old_deadline_and_receives_second_slot');
    await page.getByRole('button',{name:'End Call'}).click();
    assert.equal(await page.getByRole('button',{name:"Let's Talk"}).isDisabled(),true);
    assert.equal(await page.locator('.vd-quota-toast').count(),0);
    results.push('PASS manual_stop_preserves_quota_disable_without_reintroducing_removed_notice');
    await page.reload();
    await page.getByRole('button',{name:"Let's Talk"}).waitFor();
    assert.equal(await page.getByRole('button',{name:"Let's Talk"}).isDisabled(),true);
    assert.equal(used,2);
    results.push('PASS refresh_preserves_server_cooldown_without_new_websocket');
    reset=true;
    await page.clock.fastForward(3601000);
    await page.waitForFunction(()=>{const button=document.querySelector('voicedots-ai')?.shadowRoot?.querySelector('.vd-btn-primary');return button && !button.disabled;});
    assert.equal(await page.getByRole('button',{name:"Let's Talk"}).isEnabled(),true);
    results.push('PASS cooldown_expiry_rechecks_backend_and_reenables_connection');
    await page.getByRole('button',{name:"Let's Talk"}).click();
    await page.getByRole('button',{name:'End Call'}).waitFor();
    await page.clock.runFor(29000);
    assert.equal(await page.getByRole('button',{name:'End Call'}).count(),1);
    await page.clock.runFor(2000);
    await page.getByRole('button',{name:"Let's Talk"}).waitFor();
    assert.equal(used,3);
    results.push('PASS thirty_seconds_without_user_voice_closes_without_reconnect');
    console.log(results.join('\n'));
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
