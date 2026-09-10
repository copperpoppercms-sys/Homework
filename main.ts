Deno.serve(async (request) => {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');

  if (!target) {
    return new Response('Usage: ?url=https://example.com/path', {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }

  let targetUrl: URL;
  try { targetUrl = new URL(target); }
  catch { return new Response('Invalid URL', { status: 400 }); }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return new Response('Only http/https allowed', { status: 400 });
  }

  const init: RequestInit = {
    method: request.method,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': request.headers.get('Accept') || 'text/html,application/xhtml+xml,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': targetUrl.origin + '/',
    },
    redirect: 'follow',
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request.body;
  }

  let response: Response;
  try { response = await fetch(targetUrl.href, init); }
  catch (e) {
    return new Response('Upstream failed: ' + e.message, {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }

  const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
  const newHeaders = new Headers();

  const DROP = new Set([
    'x-frame-options','content-security-policy','content-security-policy-report-only',
    'cross-origin-opener-policy','cross-origin-embedder-policy','cross-origin-resource-policy',
    'content-encoding','content-length','transfer-encoding','connection','set-cookie',
  ]);
  for (const [k, v] of response.headers.entries()) {
    if (DROP.has(k.toLowerCase())) continue;
    newHeaders.set(k, v);
  }
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', '*');

  if (contentType.includes('text/html')) {
    let html = await response.text();
    const baseHref = new URL('.', targetUrl.href).href;

    if (!/<base\s/i.test(html)) {
      html = /<head[^>]*>/i.test(html)
        ? html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`)
        : `<base href="${baseHref}">` + html;
    }

    const runtime = `<script>(function(){
      var P=location.origin+'/?url=';
      var _f=window.fetch;
      window.fetch=function(u,o){
        try{var s=(typeof u==='string')?u:(u&&u.url)||'';
        if(s&&/^https?:\\/\\//i.test(s)&&s.indexOf(location.origin)!==0){u=P+encodeURIComponent(s)}}catch(e){}
        return _f.call(this,u,o)
      };
      var _o=XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open=function(m,u){
        try{if(u&&/^https?:\\/\\//i.test(u)&&u.indexOf(location.origin)!==0){u=P+encodeURIComponent(u)}}catch(e){}
        return _o.apply(this,arguments)
      };
    })();<\/script>`;

    html = /<head[^>]*>/i.test(html)
      ? html.replace(/<head([^>]*)>/i, `<head$1>${runtime}`)
      : runtime + html;

    return new Response(html, { status: response.status, headers: newHeaders });
  }

  return new Response(response.body, { status: response.status, headers: newHeaders });
});
