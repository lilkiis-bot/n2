/* Keep a failed module or stalled connection from leaving a permanent spinner.
   This entry deliberately uses syntax understood by older Safari versions. */
(function () {
  var finished = false;
  var timer;
  function failed(message) {
    if (finished) return;
    var main = document.getElementById('main');
    if (!main) return;
    clearTimeout(timer);
    main.innerHTML = '<section class="glass error-box" role="alert"><h1>단어장을 열지 못했어요.</h1><p></p><button class="button" type="button">다시 불러오기</button><p class="recovery-note">저장된 학습 기록은 그대로 유지돼요.</p></section>';
    main.querySelector('p').textContent = message || '연결이 늦어지고 있어요. 인터넷 연결을 확인하고 다시 불러와 주세요.';
    main.querySelector('button').onclick = function () {
      var url = new URL(window.location.href);
      url.searchParams.set('refresh', String(Date.now()));
      window.location.replace(url.href);
    };
  }
  window.N2Boot = {
    ready: function () { finished = true; clearTimeout(timer); },
    failed: failed
  };
  window.addEventListener('error', function (event) {
    if (event.target && event.target.tagName === 'SCRIPT') failed('화면을 불러오지 못했어요. 다시 불러오기를 눌러 주세요.');
  }, true);
  timer = setTimeout(function () { failed(); }, 16000);
}());
