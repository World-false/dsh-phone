// 音乐 —— 小手机应用。
//
// 这个文件不是手写的，是 dev/build-music-app.mjs 从 dsh-music 的网页半生成的。
// 要改音乐界面，去改 dsh-music/client.js，然后重新跑一次那个脚本。
//
// 和插件版的差别只有三处：
//   1. React 由手机注入（ctx.react），不是自己 require 的——应用不许自带 React。
//   2. 没有"浮在右下角"这一层：不再算位置、不再画圆按钮，界面直接铺满手机给的那块屏幕。
//   3. 本地存储换成手机给的 ctx.storage，这样卸载应用时设置会一起清掉。
module.exports = function mount(ctx) {
  if (!ctx || !ctx.root) throw new Error('手机没有给容器，应用起不来');
  if (!ctx.react) throw new Error('手机没有给 React，应用起不来');

  const React = ctx.react;
  const h = React.createElement;
  const { useCallback, useEffect, useMemo, useRef, useState } = React;
    // ────────────────────────────── 常量 ──────────────────────────────

    const PLATFORM_LABEL = { kw: '酷我', tx: 'QQ', wy: '网易' };
    const PLATFORM_TONE = {
      kw: 'var(--dsw-alias-state-warn-primary)',
      tx: 'var(--dsw-alias-state-success-primary)',
      wy: 'var(--dsw-alias-state-error-primary)',
    };
    const VOLUME_KEY = 'dsh-music:volume';
    const HISTORY_KEY = 'dsh-music:history';
    const HISTORY_MAX = 8;
    const LYRIC_LINE_HEIGHT = 28;

    const DICT = {
      zh: {
        title: '听歌',
        search: '搜索',
        playlist: '歌单',
        play: '播放',
        pause: '暂停',
        prev: '上一首',
        next: '下一首',
        loading: '正在取链接…',
        loadingSource: '正在唤醒音源…',
        noLyric: '暂无歌词',
        lyricHint: '点击播放开始',
        instrumental: '纯音乐，点右下角看封面',
        hot: '随便听听',
        history: '最近搜过',
        refreshHot: '换一批',
        clear: '清空',
        removeHistory: '删掉这条',
        searchPlaceholder: '搜歌名或歌手，回车搜索',
        noResult: '没有找到结果',
        searching: '搜索中…',
        newPlaylist: '新建歌单',
        playlistPlaceholder: '歌单名',
        emptyPlaylist: '这个歌单还是空的',
        emptyPlaylists: '还没有歌单，先建一个',
        addCurrent: '把正在播放的歌加进来',
        removeTrack: '移出歌单',
        deletePlaylist: '删除歌单',
        playAll: '播放全部',
        close: '收起',
        lyric: '歌词',
        cover: '封面',
        retry: '重试',
        failed: '播放失败',
        volume: '音量',
        save: '保存',
        cancel: '取消',
        back: '返回',
        trackCount: (n) => `${n} 首`,
      },
      en: {
        title: 'Music',
        search: 'Search',
        playlist: 'Playlists',
        play: 'Play',
        pause: 'Pause',
        prev: 'Previous',
        next: 'Next',
        loading: 'Getting the stream…',
        loadingSource: 'Waking up the source…',
        noLyric: 'No lyrics',
        lyricHint: 'Press play to start',
        instrumental: 'Instrumental — tap the cover button',
        hot: 'Try something',
        history: 'Recent searches',
        refreshHot: 'Shuffle',
        clear: 'Clear',
        removeHistory: 'Remove this',
        searchPlaceholder: 'Song or artist, then Enter',
        noResult: 'Nothing found',
        searching: 'Searching…',
        newPlaylist: 'New playlist',
        playlistPlaceholder: 'Playlist name',
        emptyPlaylist: 'This playlist is empty',
        emptyPlaylists: 'No playlists yet',
        addCurrent: 'Add the playing song here',
        removeTrack: 'Remove from playlist',
        deletePlaylist: 'Delete playlist',
        playAll: 'Play all',
        close: 'Collapse',
        lyric: 'Lyrics',
        cover: 'Cover',
        retry: 'Retry',
        failed: 'Playback failed',
        volume: 'Volume',
        save: 'Save',
        cancel: 'Cancel',
        back: 'Back',
        trackCount: (n) => `${n} track${n === 1 ? '' : 's'}`,
      },
    };

    // ────────────────────────────── 样式 ──────────────────────────────
    // 只引宿主的主题变量（--dsw-alias-*），颜色不写死；封面和图标这类图可以用自己的颜色。
    const CSS = `
.dshm-app{position:absolute;inset:0;overflow:hidden;--dshm-ease:cubic-bezier(0.23,1,0.32,1);--dshm-drawer:cubic-bezier(0.32,0.72,0,1)}
.dshm-card{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-overlay)}

/* 封面当整张卡的底：铺满、糊掉、压一层暗罩，这样卡片里外都由这首歌自己定色，
   不再是一块白。没有封面时（data-skin="false"）底子换成一层很淡的品牌色晕染，
   两种状态都有层次，都不会是纯白。 */
.dshm-skin{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none}
.dshm-skinimg{position:absolute;top:-26px;left:-26px;width:calc(100% + 52px);height:calc(100% + 52px);object-fit:cover;filter:blur(24px) saturate(160%)}
.dshm-card[data-skin="true"][data-open="true"][data-playing="true"] .dshm-skinimg{animation:dshm-breathe 26s ease-in-out infinite alternate}
@keyframes dshm-breathe{from{transform:scale(1.06)}to{transform:scale(1.15)}}
.dshm-skintint{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.46) 0%,rgba(0,0,0,.20) 34%,rgba(0,0,0,.30) 62%,rgba(0,0,0,.60) 100%)}
.dshm-card[data-skin="false"] .dshm-skintint{background:radial-gradient(130% 90% at 20% -10%,color-mix(in srgb,var(--dsw-alias-brand-primary) 20%,transparent) 0%,transparent 62%),linear-gradient(200deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent) 0%,transparent 58%)}
.dshm-card[data-skin="true"]{border-color:rgba(255,255,255,.14);box-shadow:0 18px 44px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.14)}
.dshm-card[data-skin="true"] .dshm-title{color:rgba(255,255,255,.97)}
.dshm-card[data-skin="true"] .dshm-sub{color:rgba(255,255,255,.72)}
.dshm-card[data-skin="true"] .dshm-iconbtn{color:rgba(255,255,255,.80)}
.dshm-card[data-skin="true"] .dshm-iconbtn:hover{background:rgba(255,255,255,.16);color:#fff}
.dshm-card[data-skin="true"] .dshm-round{color:rgba(255,255,255,.86)}
.dshm-card[data-skin="true"] .dshm-round:hover{background:rgba(255,255,255,.15)}
.dshm-card[data-skin="true"] .dshm-vol{color:rgba(255,255,255,.80)}
.dshm-card[data-skin="true"] .dshm-vol:hover{background:rgba(255,255,255,.15);color:#fff}
.dshm-card[data-skin="true"] .dshm-time{color:rgba(255,255,255,.68)}
.dshm-card[data-skin="true"] .dshm-track::before{background:rgba(255,255,255,.26)}
.dshm-card[data-skin="true"] .dshm-stage,.dshm-card[data-skin="true"] .dshm-lyrics{background:transparent}
.dshm-card[data-skin="true"] .dshm-fallback{opacity:0}
.dshm-card[data-skin="true"] .dshm-lrc-line{color:rgba(255,255,255,.66);text-shadow:0 1px 3px rgba(0,0,0,.5)}
.dshm-card[data-skin="true"] .dshm-lrc-line[data-active="true"]{color:#fff}
.dshm-card[data-skin="true"] .dshm-lrc-plain{color:rgba(255,255,255,.82)}
.dshm-card[data-skin="true"] .dshm-empty{color:rgba(255,255,255,.72)}
/* 搜索面板和歌单面板自己是浅色不透明底，滑上来会把封面整个盖住。
   上面那批「白字」是为了压在暗色封面上，到了面板内部就成了白字压白底，
   实测对比度只有 1.05，等于看不见。面板内部必须退回正常深色。
   下面这几条比白字规则多一层 .dshm-sheet，所以能盖住它们。 */
.dshm-card[data-skin="true"] .dshm-sheet .dshm-title{color:var(--dsw-alias-label-primary)}
.dshm-card[data-skin="true"] .dshm-sheet .dshm-sub{color:var(--dsw-alias-label-secondary)}
.dshm-card[data-skin="true"] .dshm-sheet .dshm-iconbtn{color:var(--dsw-alias-label-secondary)}
.dshm-card[data-skin="true"] .dshm-sheet .dshm-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dshm-card[data-skin="true"] .dshm-sheet .dshm-iconbtn[data-active="true"]{color:var(--dsw-alias-brand-primary)}
/* 底图是定位元素，会盖在普通流内容之上，所以内容层统一抬一层。 */
.dshm-head,.dshm-stage,.dshm-progress,.dshm-controls{position:relative;z-index:1}

.dshm-head{display:flex;align-items:center;gap:4px;padding:8px 8px 4px 12px;min-height:34px}
.dshm-headtext{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.dshm-title{font-size:12px;font-weight:600;line-height:16px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshm-sub{font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshm-iconbtn{width:26px;height:26px;flex:0 0 auto;border-radius:8px;display:grid;place-items:center;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color 120ms ease,color 120ms ease,transform 120ms var(--dshm-ease)}
.dshm-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dshm-iconbtn:active{transform:scale(0.92)}
.dshm-iconbtn[data-active="true"]{color:var(--dsw-alias-brand-primary)}

.dshm-stage{position:relative;flex:1;min-height:0;margin:2px 10px 0;border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
.dshm-stage > .dshm-swap{position:absolute;inset:0;animation:dshm-swap-in 200ms cubic-bezier(0.23,1,0.32,1)}
@keyframes dshm-swap-in{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
.dshm-cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.03);transition:opacity 220ms ease-out,transform 220ms var(--dshm-ease)}
.dshm-cover[data-show="true"]{opacity:1;transform:scale(1)}
.dshm-fallback{position:absolute;inset:0;display:grid;place-items:center;color:var(--dsw-alias-label-caption);background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,var(--dsw-alias-bg-layer-2)),var(--dsw-alias-bg-layer-2));transition:opacity 220ms ease-out}
.dshm-fallback[data-hide="true"]{opacity:0}

.dshm-lyrics{position:absolute;inset:0;overflow:hidden;background:var(--dsw-alias-bg-layer-2);opacity:0;transition:opacity 220ms ease-out}
.dshm-lyrics[data-show="true"]{opacity:1}
.dshm-lyrics-inner{position:absolute;left:0;right:0;top:0;padding:0 12px;transition:transform 420ms cubic-bezier(0.32,0.72,0,1)}
.dshm-lrc-line{height:${LYRIC_LINE_HEIGHT}px;line-height:${LYRIC_LINE_HEIGHT}px;font-size:12px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary);opacity:.45;transition:opacity 260ms ease-out,color 260ms ease-out}
.dshm-lrc-line[data-active="true"]{color:var(--dsw-alias-label-primary);opacity:1;font-weight:600}
.dshm-lrc-plain{position:absolute;inset:0;overflow-y:auto;padding:10px 12px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.dshm-empty{position:absolute;inset:0;display:grid;place-items:center;font-size:11px;color:var(--dsw-alias-label-caption)}

.dshm-progress{display:flex;align-items:center;gap:8px;padding:8px 12px 2px}
.dshm-track{position:relative;flex:1;height:14px;display:grid;align-items:center;cursor:pointer;touch-action:none}
.dshm-track::before{content:"";position:absolute;left:0;right:0;height:3px;border-radius:2px;background:var(--dsw-alias-border-l2)}
.dshm-fill{position:absolute;left:0;right:0;height:3px;border-radius:2px;background:var(--dsw-alias-brand-primary);transform-origin:left center;transform:scaleX(0);transition:transform 200ms linear}
.dshm-fill[data-dragging="true"]{transition:none}
.dshm-knob{position:absolute;left:0;top:50%;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:var(--dsw-alias-brand-primary);transform:translateY(-50%) scale(0.6);opacity:0;transition:transform 140ms var(--dshm-ease),opacity 140ms ease-out}
.dshm-track:hover .dshm-knob,.dshm-track[data-dragging="true"] .dshm-knob{transform:translateY(-50%) scale(1);opacity:1}
.dshm-time{font-size:10px;line-height:14px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}

/* 一整行三条：左端音量、中间上一首/播放/下一首、右端歌词封面切换。
   中间那组按 1fr auto 1fr 的网格居中，两边的按钮各自贴住自己那侧，所以左右对称。 */
.dshm-controls{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;padding:4px 10px 10px}
.dshm-sider{display:flex;align-items:center;gap:2px;min-width:0}
.dshm-sider-left{justify-self:start}
.dshm-sider-right{justify-self:end}
.dshm-center{display:flex;align-items:center;gap:10px;justify-self:center}
.dshm-vol{position:relative;flex:0 0 auto;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:color 120ms ease,background-color 120ms ease}
.dshm-vol:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dshm-vol[data-muted="true"]{color:var(--dsw-alias-label-caption)}
.dshm-volicon{display:block;line-height:0}
/* 音量在左边，滑块就朝右上展开，不会顶出卡片左边缘。 */
.dshm-volpop{position:absolute;left:-4px;bottom:calc(100% + 2px);z-index:3;display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:10px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 8px 20px rgba(0,0,0,.18);opacity:0;transform:translateY(4px) scale(0.96);transform-origin:bottom left;pointer-events:none;will-change:opacity,transform;transition:opacity 140ms ease-out,transform 140ms cubic-bezier(0.23,1,0.32,1)}
.dshm-vol:hover .dshm-volpop,.dshm-vol:focus-within .dshm-volpop{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
.dshm-range{width:86px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary);background:transparent;cursor:pointer}
.dshm-volpct{width:28px;text-align:right;font-size:10px;line-height:14px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}
.dshm-round{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;border:0;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;transition:background-color 120ms ease,transform 120ms var(--dshm-ease)}
.dshm-round:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshm-round:active{transform:scale(0.92)}
.dshm-play{width:38px;height:38px;border-radius:50%;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);display:grid;place-items:center;border:0;cursor:pointer;position:relative;transition:transform 120ms var(--dshm-ease),filter 120ms ease}
.dshm-play:hover{filter:brightness(1.06)}
.dshm-play:active{transform:scale(0.94)}
.dshm-play svg{position:absolute;transition:opacity 140ms ease-out,transform 140ms var(--dshm-ease)}
.dshm-play svg[data-on="false"]{opacity:0;transform:scale(0.9)}
.dshm-play svg[data-on="true"]{opacity:1;transform:scale(1)}
.dshm-eq{position:absolute;right:10px;bottom:10px;display:flex;align-items:flex-end;gap:2px;height:12px;color:var(--dsw-alias-brand-primary);opacity:0;transition:opacity 180ms ease-out}
.dshm-eq[data-on="true"]{opacity:1}
.dshm-eq i{display:block;width:2px;height:12px;border-radius:1px;background:currentColor;transform-origin:bottom center;animation:dshm-eq 1s ease-in-out infinite alternate}
.dshm-eq i:nth-child(1){animation-duration:900ms}
.dshm-eq i:nth-child(2){animation-duration:1100ms}
.dshm-eq i:nth-child(3){animation-duration:1300ms}
@keyframes dshm-eq{from{transform:scaleY(.25)}to{transform:scaleY(1)}}

.dshm-sheet{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);transform:translateY(100%);transition:transform 240ms var(--dshm-drawer),opacity 200ms ease-out;opacity:.6;pointer-events:none;z-index:2}
.dshm-sheet[data-open="true"]{transform:translateY(0);opacity:1;pointer-events:auto}
.dshm-sheet-body{flex:1;min-height:0;overflow-y:auto;padding:0 8px 8px}
.dshm-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;transition:background-color 120ms ease;opacity:0;transform:translateY(6px)}
.dshm-sheet[data-open="true"] .dshm-row{opacity:1;transform:translateY(0);transition:background-color 120ms ease,opacity 200ms ease-out,transform 200ms var(--dshm-ease);transition-delay:calc(var(--i,0) * 30ms)}
.dshm-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshm-row[data-current="true"]{background:var(--dsw-alias-bg-multi-select,#eee)}
.dshm-rowmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.dshm-rowtitle{font-size:11px;line-height:15px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshm-rowsub{font-size:10px;line-height:13px;color:var(--dsw-alias-label-caption);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshm-badge{flex:0 0 auto;font-size:9px;line-height:14px;padding:0 5px;border-radius:4px;border:1px solid currentColor;color:var(--dsw-alias-label-caption)}
.dshm-input{flex:1;min-width:0;height:26px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:11px;padding:0 8px;outline:none;transition:border-color 120ms ease}
.dshm-input:focus{border-color:var(--dsw-alias-brand-primary)}
.dshm-note{padding:16px 8px;text-align:center;font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption)}
.dshm-grouplabel{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 8px 6px;font-size:10px;font-weight:500;letter-spacing:.04em;color:var(--dsw-alias-label-caption)}
.dshm-grouplabel span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshm-linkbtn{border:0;background:transparent;color:var(--dsw-alias-label-caption);font-size:10px;cursor:pointer;padding:2px 4px;border-radius:5px;transition:color 120ms ease,background-color 120ms ease}
.dshm-linkbtn:hover:not(:disabled){color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dshm-linkbtn:disabled{cursor:default;opacity:.6}
.dshm-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 8px 4px}
.dshm-chip{display:inline-flex;align-items:center;max-width:100%;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:999px;transition:color 120ms ease,border-color 120ms ease,background-color 120ms ease}
.dshm-chip:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover)}
.dshm-chiplabel{flex:0 1 auto;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;background:transparent;color:inherit;font-size:11px;line-height:16px;padding:3px 2px 3px 9px;cursor:pointer}
/* 删除叉一直占着那 16 像素，只在悬停时淡入——这样鼠标移到哪个都不会把标签挤变形。 */
.dshm-chipx{flex:0 0 auto;width:16px;height:16px;margin-right:3px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-caption);display:grid;place-items:center;cursor:pointer;opacity:0;transform:scale(0.85);transition:opacity 120ms ease-out,transform 120ms var(--dshm-ease),background-color 120ms ease,color 120ms ease}
.dshm-chip:hover .dshm-chipx,.dshm-chipx:focus-visible{opacity:1;transform:scale(1)}
.dshm-chipx:hover{background:var(--dsw-alias-bg-layer-3,rgba(127,127,127,.18));color:var(--dsw-alias-label-primary)}
.dshm-chipx:active{transform:scale(0.88)}
.dshm-headrow{display:flex;align-items:center;gap:4px;padding:8px 8px 6px 12px;min-height:34px}
.dshm-headrow .dshm-title{font-size:12px}

@media (hover:none),(pointer:coarse){
  .dshm-fab:hover,.dshm-iconbtn:hover,.dshm-round:hover,.dshm-row:hover,.dshm-vol:hover,.dshm-chip:hover,.dshm-linkbtn:hover{background:transparent}
  .dshm-vol:hover{color:inherit}
  .dshm-track:hover .dshm-knob{transform:translateY(-50%) scale(0.6);opacity:0}
  /* 没有悬停的触屏上，删除叉得一直露着，不然根本点不到。 */
  .dshm-chipx{opacity:1;transform:none}
}
@media (prefers-reduced-motion:reduce){
  .dshm-root,.dshm-card,.dshm-sheet,.dshm-row,.dshm-cover,.dshm-lyrics-inner,.dshm-fill,.dshm-lrc-line,.dshm-play svg,.dshm-fab,.dshm-eq,.dshm-vol,.dshm-volpop,.dshm-chip,.dshm-chipx{transition-duration:1ms!important}
  .dshm-eq i{animation:none!important;transform:scaleY(.3)}
  .dshm-skinimg{animation:none!important}
  .dshm-card[data-open="false"],.dshm-fab{animation:none!important}
}
`;

    // ────────────────────────────── 图标 ──────────────────────────────

    function icon(path, size, extra) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true, ...(extra || {}) },
        h('path', { d: path }),
      );
    }
    const IconPlay = (size = 18) => icon('M8 5v14l11-7z', size);
    const IconPause = (size = 18) => icon('M7 5h4v14H7V5zm6 0h4v14h-4V5z', size);
    const IconPrev = (size = 16) => icon('M7 5h2v14H7V5zm12 0v14l-9-7 9-7z', size);
    const IconNext = (size = 16) => icon('M15 5h2v14h-2V5zM5 5v14l9-7-9-7z', size);
    const IconSearch = (size = 15) =>
      icon('M11 4a7 7 0 015.53 11.29l3.59 3.59-1.41 1.41-3.59-3.59A7 7 0 1111 4zm0 2a5 5 0 100 10 5 5 0 000-10z', size);
    const IconList = (size = 15) => icon('M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z', size);
    const IconClose = (size = 14) =>
      icon('M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5z', size);
    const IconBack = (size = 15) => icon('M14.7 5.3L16.1 6.7 10.8 12l5.3 5.3-1.4 1.4L8 12l6.7-6.7z', size);
    const IconPlus = (size = 14) => icon('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z', size);
    const IconTrash = (size = 13) =>
      icon('M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 11H7L6 9zm3 2v7h2v-7H9zm4 0v7h2v-7h-2z', size);
    const IconNote = (size = 34) =>
      icon(
        'M9 19a3 3 0 11-2-2.83V5l9 2v3.2L9 8.4V19zm10-8v6.17A3 3 0 1117 16.7V13l2-1z',
        size,
      );
    const IconLyric = (size = 15) => icon('M4 5h16v2H4V5zm0 4h10v2H4V9zm0 4h16v2H4v-2zm0 4h8v2H4v-2z', size);
    const IconCover = (size = 15) =>
      icon('M4 4h16v16H4V4zm2 2v9l4-4 3 3 3-3 2 2V6H6zm3 1.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z', size);
    const IconVolume = (size = 15) =>
      icon('M11 4v16l-5-4H3V8h3l5-4zm3 3.6a6 6 0 010 8.8l-1.3-1.5a4 4 0 000-5.8L14 7.6zm2.2-2.6a9 9 0 010 14l-1.3-1.5a7 7 0 000-11L16.2 5z', size);
    const IconMute = (size = 15) =>
      icon('M11 4v16l-5-4H3V8h3l5-4zm3.3 3.3L15.7 5.9l2.1 2.1 2.1-2.1 1.4 1.4L19.2 9.4l2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1-2.1-2.1z', size);

    /** 播放/暂停两个图标叠着交叉淡入，切换时不闪。 */
    const stackedIconStyle = (visible) => ({
      position: 'absolute',
      inset: 0,
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1)' : 'scale(0.9)',
      transition: 'opacity 140ms ease-out, transform 140ms cubic-bezier(0.23,1,0.32,1)',
    });

    // ────────────────────────────── 小工具 ──────────────────────────────

    function formatTime(seconds) {
      const value = Number(seconds);
      if (!Number.isFinite(value) || value <= 0) return '0:00';
      const total = Math.floor(value);
      const minutes = Math.floor(total / 60);
      const rest = total % 60;
      return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
    }

    async function callHost(method, params) {
      // 手机替我们转给后端插件，返回的就是后端原样回的那份 { ok, data } / { ok:false, error }。
      return ctx.api.call(method, params || {});
    }

    /** 音量、搜索历史都存在手机的私有存储里；读不到就用默认值。 */
    let settingsCache = {};
    let settingsReady = null;
    let settingsTimer = 0;
    let settingsDirty = false;

    function settingsLoad() {
      if (settingsReady === null) {
        settingsReady = (async () => {
          try {
            const value = await ctx.storage.get();
            settingsCache = value !== null && typeof value === 'object' ? value : {};
          } catch {
            settingsCache = {};
          }
          return settingsCache;
        })();
      }
      return settingsReady;
    }

    /**
     * 写设置。
     *
     * 拖音量滑块时 onChange 一秒能触发几十次，而这里的存储要走一次 HTTP 到宿主。
     * 每次都写会把请求打爆，所以攒一下：最后一次改动之后 400 毫秒才落盘。
     * 卸载时由 unmount 立刻 flush，不会丢。
     */
    function settingsMerge(patch) {
      settingsCache = { ...settingsCache, ...patch };
      settingsDirty = true;
      if (settingsTimer !== 0) return;
      settingsTimer = window.setTimeout(() => {
        settingsTimer = 0;
        settingsFlush();
      }, 400);
    }

    /** 真的落盘。没改过就不写，免得每次退出都白写一次。 */
    function settingsFlush() {
      if (settingsTimer !== 0) {
        window.clearTimeout(settingsTimer);
        settingsTimer = 0;
      }
      if (!settingsDirty) return;
      settingsDirty = false;
      const snapshot = settingsCache;
      void Promise.resolve(ctx.storage.set(snapshot)).catch(() => {
        settingsDirty = true; // 写失败了下次再试
      });
    }

    function readVolume() {
      const value = Number(settingsCache.volume);
      if (Number.isFinite(value) && value >= 0 && value <= 1) return value;
      return 0.9;
    }

    /** 搜索历史：一个关键词一条，最新的排最前，最多留 HISTORY_MAX 条。 */
    function readHistory() {
      const list = settingsCache[HISTORY_KEY];
      if (!Array.isArray(list)) return [];
      return list.filter((one) => typeof one === 'string' && one.trim() !== '').slice(0, HISTORY_MAX);
    }

    function writeHistory(list) {
      settingsMerge({ [HISTORY_KEY]: list.slice(0, HISTORY_MAX) });
    }

    function trackKey(track) {
      return track && track.platform && track.id ? `${track.platform}:${track.id}` : '';
    }

    /** 歌词里当前该高亮哪一行。 */
    function activeLyricIndex(lines, position) {
      if (!Array.isArray(lines) || lines.length === 0) return -1;
      let low = 0;
      let high = lines.length - 1;
      let found = -1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (lines[middle].t <= position) {
          found = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      return found;
    }

    // ────────────────────────────── 主组件 ──────────────────────────────

    function MusicWidget() {
      const [panel, setPanel] = useState(null); // null | 'search' | 'playlist'
      const [stage, setStage] = useState('lyrics'); // 'lyrics' | 'cover'
      const [volume, setVolume] = useState(readVolume);

      const [query, setQuery] = useState('');
      const [results, setResults] = useState([]);
      const [searching, setSearching] = useState(false);
      const [searchNote, setSearchNote] = useState('');
      const [history, setHistory] = useState(readHistory);
      const [hot, setHot] = useState([]);
      const [hotLoading, setHotLoading] = useState(false);

      const [queue, setQueue] = useState([]);
      const [index, setIndex] = useState(-1);
      const [status, setStatus] = useState('idle'); // idle | loading | playing | paused | error
      const [message, setMessage] = useState('');
      const [position, setPosition] = useState(0);
      const [duration, setDuration] = useState(0);
      const [dragging, setDragging] = useState(false);
      const [lyrics, setLyrics] = useState({ state: 'idle', lines: [], hasTimeline: false });
      const [stageHeight, setStageHeight] = useState(200);

      const [playlists, setPlaylists] = useState([]);
      const [activePlaylistId, setActivePlaylistId] = useState('');
      const [creating, setCreating] = useState(false);
      const [draftName, setDraftName] = useState('');

      const audioRef = useRef(null);
      const rootRef = useRef(null);
      const volRef = useRef(null);
      const queueRef = useRef([]);
      const indexRef = useRef(-1);
      const scrubbingRef = useRef(false);
      const retriedRef = useRef(false);
      const stageRef = useRef(null);
      const localeRev = useRef(0);
      const [, forceRender] = useState(0);

      const track = index >= 0 && index < queue.length ? queue[index] : null;
      /** 有封面才铺封面当底；没有就走主题色的那套配色，两条路都不留白块。 */
      const skin = track !== null && Boolean(track.cover);
      const trackRef = useRef(track);
      trackRef.current = track;

      // 文案：优先用宿主的语言服务，拿不到就按页面语言选内置词典
      const t = useMemo(() => {
        const dictionary = (locale) => (String(locale || '').toLowerCase().startsWith('zh') ? DICT.zh : DICT.en);
        return (key, ...args) => {
          void localeRev.current;
          let dict = DICT.zh;
          try {
            dict = dictionary(localeRev.current || ctx.locale);
          } catch {
            /* 用默认词典 */
          }
          const value = dict[key];
          if (typeof value === 'function') return value(...args);
          return value === undefined ? key : value;
        };
      }, []);

      useEffect(() => {
        /* 语言由手机通知（ctx.onChange），不再自己盯页面 */
        return ctx.onChange((snapshot) => {
          if (!snapshot) return;
          localeRev.current = snapshot.locale || localeRev.current;
          forceRender((value) => value + 1);
          void snapshot;
        });
      }, []);


      // ── 舞台高度（歌词居中要用） ──
      // 卡片一直是挂在 DOM 上的（收起只是透明），盒子尺寸不随开合变，
      useEffect(() => {
        if (stageRef.current === null) return undefined;
        const element = stageRef.current;
        const measure = () => setStageHeight(element.clientHeight || 200);
        measure();
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(measure);
          observer.observe(element);
          return () => observer.disconnect();
        }
        return undefined;
      }, []);

      // ── 播放器：一个 <audio>，卸载时彻底释放 ──
      useEffect(() => {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.volume = readVolume();
        audioRef.current = audio;

        const onTime = () => {
          if (!scrubbingRef.current) setPosition(audio.currentTime || 0);
        };
        const onLoaded = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
        const onPlay = () => setStatus('playing');
        const onPause = () => setStatus((previous) => (previous === 'error' ? previous : 'paused'));
        const onEnded = () => {
          const list = queueRef.current;
          const current = indexRef.current;
          if (list.length === 0) return;
          const nextIndex = current + 1 < list.length ? current + 1 : 0;
          void playIndex(nextIndex, list);
        };
        const onError = () => {
          const current = trackRef.current;
          if (current === null) return;
          if (retriedRef.current) {
            setStatus('error');
            setMessage(t('failed'));
            return;
          }
          retriedRef.current = true;
          const resumeAt = audio.currentTime || 0;
          void (async () => {
            try {
              const reply = await callHost('url', { track: current });
              if (!reply.ok) {
                setStatus('error');
                setMessage(reply.error || t('failed'));
                return;
              }
              audio.src = reply.data.url;
              audio.currentTime = resumeAt;
              await audio.play();
            } catch (error) {
              setStatus('error');
              setMessage(error && error.message ? error.message : t('failed'));
            }
          })();
        };

        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('durationchange', onLoaded);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        return () => {
          audio.removeEventListener('timeupdate', onTime);
          audio.removeEventListener('loadedmetadata', onLoaded);
          audio.removeEventListener('durationchange', onLoaded);
          audio.removeEventListener('play', onPlay);
          audio.removeEventListener('pause', onPause);
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          audioRef.current = null;
        };
      }, []);

      // ── 音量：拖一次，audio 跟着走，顺手记到本地 ──
      useEffect(() => {
        const audio = audioRef.current;
        if (audio !== null) audio.volume = volume;
        settingsMerge({ [VOLUME_KEY]: volume });
      }, [volume]);

      // ── 首次加载：歌单和上次播放 ──
      useEffect(() => {
        void (async () => {
          try {
            const reply = await callHost('playlists.get');
            if (reply.ok) {
              setPlaylists(reply.data.playlists || []);
              const last = reply.data.last;
              if (last !== null && last.track !== undefined && trackKey(last.track) !== '') {
                setQueue([last.track]);
                queueRef.current = [last.track];
                setIndex(0);
                indexRef.current = 0;
                setDuration(Number(last.track.duration) || 0);
                // 恢复的是「上次听的歌」，歌词和封面得跟着补上，否则面板一直是「暂无歌词」
                void loadLyricsAndPickStage(last.track);
              }
            }
          } catch {
            /* 宿主还没起来 */
          }
          try {
            await callHost('warmup');
          } catch {
            /* 预热失败不影响搜索 */
          }
        })();
      }, []);

      const savePlaylists = useCallback(async (next) => {
        setPlaylists(next);
        try {
          const reply = await callHost('playlists.save', { playlists: next });
          if (reply.ok && Array.isArray(reply.data.playlists)) setPlaylists(reply.data.playlists);
        } catch {
          /* 存不上就先留在内存里 */
        }
      }, []);

      const saveLast = useCallback(async (nextTrack) => {
        if (!nextTrack) return;
        try {
          await callHost('state.save', { last: { track: nextTrack, at: Date.now() } });
        } catch {
          /* 记不住就算了 */
        }
      }, []);

      /** 取歌词，并把结果交回去，好让调用方决定要不要顺带切页面。 */
      const loadLyrics = useCallback(async (nextTrack) => {
        setLyrics({ state: 'loading', lines: [], hasTimeline: false });
        let loaded = { state: 'empty', lines: [], hasTimeline: false };
        try {
          const reply = await callHost('lyric', { track: nextTrack });
          if (reply.ok) {
            loaded = { state: 'ready', lines: reply.data.lines || [], hasTimeline: Boolean(reply.data.hasTimeline) };
          }
        } catch {
          /* 取不到就当没有 */
        }
        setLyrics(loaded);
        return loaded;
      }, []);

      /** 歌词到手后再决定看哪一页：纯音乐（只有一两行）直接翻到封面。 */
      const loadLyricsAndPickStage = useCallback(
        async (nextTrack) => {
          const loaded = await loadLyrics(nextTrack);
          if (loaded.state === 'ready' && loaded.lines.length < 3 && nextTrack.cover) setStage('cover');
        },
        [loadLyrics],
      );

      const playIndex = useCallback(
        async (nextIndex, list) => {
          const source = Array.isArray(list) ? list : queueRef.current;
          const nextTrack = source[nextIndex];
          if (nextTrack === undefined) return;
          queueRef.current = source;
          indexRef.current = nextIndex;
          setQueue(source);
          setIndex(nextIndex);
          setStatus('loading');
          setMessage('');
          setPosition(0);
          setDuration(Number(nextTrack.duration) || 0);
          retriedRef.current = false;
          void loadLyricsAndPickStage(nextTrack);
          void saveLast(nextTrack);

          const audio = audioRef.current;
          try {
            const reply = await callHost('url', { track: nextTrack });
            if (!reply.ok) {
              // 换下一首也会失败的话就停在这，把原因显示出来
              setStatus('error');
              setMessage(reply.error || t('failed'));
              return;
            }
            if (audio === null) return;
            audio.src = reply.data.url;
            await audio.play();
            setStatus('playing');
          } catch (error) {
            setStatus('error');
            setMessage(error && error.message ? error.message : t('failed'));
          }
        },
        [loadLyricsAndPickStage, saveLast, t],
      );

      const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (audio === null) return;
        if (track === null) {
          if (results.length > 0) void playIndex(0, results);
          return;
        }
        if (status === 'playing') {
          audio.pause();
          setStatus('paused');
          return;
        }
        if (status === 'error' || audio.src === '') {
          void playIndex(indexRef.current, queueRef.current);
          return;
        }
        void audio.play().catch(() => setStatus('paused'));
      }, [playIndex, results, status, t, track]);

      const step = useCallback(
        (delta) => {
          const list = queueRef.current;
          if (list.length === 0) return;
          const current = indexRef.current;
          const nextIndex = (current + delta + list.length) % list.length;
          void playIndex(nextIndex, list);
        },
        [playIndex],
      );

      const seekTo = useCallback(
        (ratio) => {
          const audio = audioRef.current;
          if (audio === null || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
          audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
          setPosition(audio.currentTime);
        },
        [],
      );

      const onTrackPointer = useCallback(
        (event) => {
          const element = event.currentTarget;
          const rect = element.getBoundingClientRect();
          seekTo(rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width);
        },
        [seekTo],
      );

      /** 拉一批随机热歌。每次开面板或点「换一批」都重新挑，所以每回都不一样。 */
      const loadHot = useCallback(async () => {
        setHotLoading(true);
        try {
          const reply = await callHost('chart', { limit: 12 });
          if (reply.ok) setHot(reply.data.items || []);
        } catch {
          /* 榜单拉不到就不显示这一块 */
        } finally {
          setHotLoading(false);
        }
      }, []);

      const doSearch = useCallback(
        async (keywordInput) => {
          const keyword = String(keywordInput === undefined ? query : keywordInput).trim();
          if (keyword === '') return;
          setQuery(keyword);
          setSearching(true);
          setSearchNote('');
          // 搜之前先记一笔，搜完不用管成功失败
          setHistory((previous) => {
            const next = [keyword, ...previous.filter((one) => one !== keyword)].slice(0, HISTORY_MAX);
            writeHistory(next);
            return next;
          });
          try {
            const reply = await callHost('search', { q: keyword });
            if (reply.ok) {
              setResults(reply.data.items || []);
              setSearchNote(reply.data.items && reply.data.items.length > 0 ? '' : t('noResult'));
            } else {
              setResults([]);
              setSearchNote(reply.error || t('failed'));
            }
          } catch (error) {
            setResults([]);
            setSearchNote(error && error.message ? error.message : t('failed'));
          } finally {
            setSearching(false);
          }
        },
        [query, t],
      );

      const clearHistory = useCallback(() => {
        writeHistory([]);
        setHistory([]);
      }, []);

      /** 只删这一条，其他历史原样留着。 */
      const removeHistory = useCallback((word) => {
        setHistory((previous) => {
          const next = previous.filter((one) => one !== word);
          writeHistory(next);
          return next;
        });
      }, []);

      // ── 打开搜索面板时：热歌先端上来，每次换一批 ──
      useEffect(() => {
        if (panel !== 'search') return;
        void loadHot();
      }, [panel, loadHot]);

      const currentPlaylist = playlists.find((one) => one.id === activePlaylistId);

      const addTrackToPlaylist = useCallback(
        (playlistId, item) => {
          if (!item) return;
          const next = playlists.map((playlist) => {
            if (playlist.id !== playlistId) return playlist;
            if (playlist.tracks.some((one) => trackKey(one) === trackKey(item))) return playlist;
            return { ...playlist, tracks: [...playlist.tracks, item], updatedAt: Date.now() };
          });
          void savePlaylists(next);
        },
        [playlists, savePlaylists],
      );

      const createPlaylist = useCallback(() => {
        const name = draftName.trim();
        if (name === '') return;
        const created = { id: `pl-${Date.now().toString(36)}`, name: name.slice(0, 60), tracks: [], updatedAt: Date.now() };
        void savePlaylists([...playlists, created]);
        setDraftName('');
        setCreating(false);
        setActivePlaylistId(created.id);
      }, [draftName, playlists, savePlaylists]);

      const deletePlaylist = useCallback(
        (playlistId) => {
          void savePlaylists(playlists.filter((one) => one.id !== playlistId));
          if (activePlaylistId === playlistId) setActivePlaylistId('');
        },
        [activePlaylistId, playlists, savePlaylists],
      );

      const removeTrack = useCallback(
        (playlistId, item) => {
          const next = playlists.map((playlist) =>
            playlist.id === playlistId
              ? { ...playlist, tracks: playlist.tracks.filter((one) => trackKey(one) !== trackKey(item)), updatedAt: Date.now() }
              : playlist,
          );
          void savePlaylists(next);
        },
        [playlists, savePlaylists],
      );

      // ── 当前歌词高亮与滚动 ──
      const lyricIndex = lyrics.hasTimeline ? activeLyricIndex(lyrics.lines, position) : -1;
      const lyricsOffset = useMemo(() => {
        if (lyricIndex < 0) return 0;
        const center = stageHeight / 2 - LYRIC_LINE_HEIGHT / 2;
        return Math.max(0, lyricIndex * LYRIC_LINE_HEIGHT - center);
      }, [lyricIndex, stageHeight]);

      const progress = duration > 0 ? Math.min(1, position / duration) : 0;
      const playing = status === 'playing';
      const showLyrics = stage === 'lyrics';
      const badgeOf = (platform) => PLATFORM_LABEL[platform] || platform;

      // ── 渲染：搜索面板 ──
      const searchSheet = h(
        'div',
        { className: 'dshm-sheet', 'data-open': panel === 'search' },
        h(
          'div',
          { className: 'dshm-headrow' },
          h(
            'button',
            {
              className: 'dshm-iconbtn',
              type: 'button',
              title: t('back'),
              'aria-label': t('back'),
              onClick: () => setPanel(null),
            },
            IconBack(),
          ),
          h('div', { className: 'dshm-headtext' }, h('div', { className: 'dshm-title' }, t('search'))),
        ),
        h(
          'div',
          { style: { display: 'flex', gap: '6px', padding: '0 10px 6px' } },
          h('input', {
            className: 'dshm-input',
            value: query,
            placeholder: t('searchPlaceholder'),
            onChange: (event) => {
              const next = event.target.value;
              setQuery(next);
              // 把输入框清空就等于回到起点：上一轮的结果一起丢掉，
              // 面板才会退回「搜索历史 + 随便听听」，而不是继续挂着旧结果。
              if (next.trim() === '') {
                setResults([]);
                setSearchNote('');
              }
            },
            onKeyDown: (event) => {
              if (event.key === 'Enter') void doSearch();
            },
          }),
          h(
            'button',
            { className: 'dshm-iconbtn', type: 'button', onClick: () => void doSearch(), 'aria-label': t('search') },
            IconSearch(),
          ),
        ),
        h(
          'div',
          { className: 'dshm-sheet-body' },
          searching ? h('div', { className: 'dshm-note' }, t('searching')) : null,
          // 还没搜过东西的时候，这里给历史 + 一批随机热歌；搜出结果就只显示结果
          results.length === 0 && searchNote === '' && !searching
            ? h(
                'div',
                null,
                history.length > 0
                  ? h(
                      'div',
                      null,
                      h(
                        'div',
                        { className: 'dshm-grouplabel' },
                        h('span', null, t('history')),
                        h(
                          'button',
                          { className: 'dshm-linkbtn', type: 'button', onClick: clearHistory },
                          t('clear'),
                        ),
                      ),
                      h(
                        'div',
                        { className: 'dshm-chips' },
                        history.map((word) =>
                          h(
                            'div',
                            { key: word, className: 'dshm-chip' },
                            h(
                              'button',
                              {
                                className: 'dshm-chiplabel',
                                type: 'button',
                                title: word,
                                onClick: () => void doSearch(word),
                              },
                              word,
                            ),
                            h(
                              'button',
                              {
                                className: 'dshm-chipx',
                                type: 'button',
                                title: t('removeHistory'),
                                'aria-label': t('removeHistory'),
                                onClick: () => removeHistory(word),
                              },
                              IconClose(9),
                            ),
                          ),
                        ),
                      ),
                    )
                  : null,
                h(
                  'div',
                  null,
                  h(
                    'div',
                    { className: 'dshm-grouplabel' },
                    h('span', null, t('hot')),
                    h(
                      'button',
                      { className: 'dshm-linkbtn', type: 'button', disabled: hotLoading, onClick: () => void loadHot() },
                      hotLoading ? t('loading') : t('refreshHot'),
                    ),
                  ),
                  hot.map((item, i) =>
                    h(
                      'div',
                      {
                        key: item.key + ':hot:' + i,
                        className: 'dshm-row',
                        style: { '--i': i },
                        'data-current': trackKey(item) === trackKey(track),
                        onClick: () => {
                          void playIndex(i, hot);
                          setPanel(null);
                        },
                      },
                      h('span', { className: 'dshm-badge', style: { color: PLATFORM_TONE[item.platform] } }, badgeOf(item.platform)),
                      h(
                        'div',
                        { className: 'dshm-rowmain' },
                        h('div', { className: 'dshm-rowtitle' }, item.title),
                        h('div', { className: 'dshm-rowsub' }, `${item.artist || '—'} · ${formatTime(item.duration)}`),
                      ),
                    ),
                  ),
                ),
              )
            : null,
          results.length === 0 && !searching && searchNote !== ''
            ? h('div', { className: 'dshm-note' }, searchNote)
            : null,
          results.map((item, i) =>
            h(
              'div',
              {
                key: item.key + ':' + i,
                className: 'dshm-row',
                style: { '--i': i },
                'data-current': trackKey(item) === trackKey(track),
                onClick: () => {
                  void playIndex(i, results);
                  setPanel(null);
                },
              },
              h('span', { className: 'dshm-badge', style: { color: PLATFORM_TONE[item.platform] } }, badgeOf(item.platform)),
              h(
                'div',
                { className: 'dshm-rowmain' },
                h('div', { className: 'dshm-rowtitle' }, item.title),
                h('div', { className: 'dshm-rowsub' }, `${item.artist || '—'} · ${formatTime(item.duration)}`),
              ),
            ),
          ),
        ),
      );

      // ── 渲染：歌单面板 ──
      const playlistSheet = h(
        'div',
        { className: 'dshm-sheet', 'data-open': panel === 'playlist' },
        h(
          'div',
          { className: 'dshm-headrow' },
          h(
            'button',
            {
              className: 'dshm-iconbtn',
              type: 'button',
              title: t('back'),
              'aria-label': t('back'),
              onClick: () => {
                if (activePlaylistId !== '') setActivePlaylistId('');
                else setPanel(null);
              },
            },
            IconBack(),
          ),
          h(
            'div',
            { className: 'dshm-headtext' },
            h('div', { className: 'dshm-title' }, currentPlaylist ? currentPlaylist.name : t('playlist')),
          ),
          h(
            'button',
            { className: 'dshm-iconbtn', type: 'button', title: t('newPlaylist'), onClick: () => setCreating((value) => !value) },
            IconPlus(),
          ),
          currentPlaylist
            ? h(
                'button',
                {
                  className: 'dshm-iconbtn',
                  type: 'button',
                  title: t('deletePlaylist'),
                  onClick: () => deletePlaylist(currentPlaylist.id),
                },
                IconTrash(),
              )
            : null,
        ),
        creating
          ? h(
              'div',
              { style: { display: 'flex', gap: '6px', padding: '0 10px 6px' } },
              h('input', {
                className: 'dshm-input',
                value: draftName,
                placeholder: t('playlistPlaceholder'),
                onChange: (event) => setDraftName(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') createPlaylist();
                },
              }),
              h(
                'button',
                { className: 'dshm-iconbtn', type: 'button', onClick: createPlaylist },
                IconPlus(),
              ),
            )
          : null,
        h(
          'div',
          { className: 'dshm-sheet-body' },
          currentPlaylist === undefined
            ? playlists.length === 0
              ? h('div', { className: 'dshm-note' }, t('emptyPlaylists'))
              : playlists.map((playlist, i) =>
                  h(
                    'div',
                    {
                      key: playlist.id,
                      className: 'dshm-row',
                      style: { '--i': i },
                      onClick: () => setActivePlaylistId(playlist.id),
                    },
                    h(
                      'div',
                      { className: 'dshm-rowmain' },
                      h('div', { className: 'dshm-rowtitle' }, playlist.name),
                      h('div', { className: 'dshm-rowsub' }, t('trackCount', playlist.tracks.length)),
                    ),
                    h(
                      'button',
                      {
                        className: 'dshm-iconbtn',
                        type: 'button',
                        title: t('addCurrent'),
                        onClick: (event) => {
                          event.stopPropagation();
                          addTrackToPlaylist(playlist.id, track);
                        },
                      },
                      IconPlus(),
                    ),
                  ),
                )
            : currentPlaylist.tracks.length === 0
              ? h('div', { className: 'dshm-note' }, t('emptyPlaylist'))
              : [
                  h(
                    'div',
                    {
                      key: 'playall',
                      className: 'dshm-row',
                      style: { '--i': 0 },
                      onClick: () => {
                        void playIndex(0, currentPlaylist.tracks);
                        setPanel(null);
                      },
                    },
                    h('div', { className: 'dshm-rowmain' }, h('div', { className: 'dshm-rowtitle' }, t('playAll'))),
                    IconPlay(14),
                  ),
                  ...currentPlaylist.tracks.map((item, i) =>
                    h(
                      'div',
                      {
                        key: trackKey(item) + ':' + i,
                        className: 'dshm-row',
                        style: { '--i': i + 1 },
                        'data-current': trackKey(item) === trackKey(track),
                        onClick: () => {
                          void playIndex(i, currentPlaylist.tracks);
                          setPanel(null);
                        },
                      },
                      h('span', { className: 'dshm-badge', style: { color: PLATFORM_TONE[item.platform] } }, badgeOf(item.platform)),
                      h(
                        'div',
                        { className: 'dshm-rowmain' },
                        h('div', { className: 'dshm-rowtitle' }, item.title),
                        h('div', { className: 'dshm-rowsub' }, item.artist || '—'),
                      ),
                      h(
                        'button',
                        {
                          className: 'dshm-iconbtn',
                          type: 'button',
                          title: t('removeTrack'),
                          onClick: (event) => {
                            event.stopPropagation();
                            removeTrack(currentPlaylist.id, item);
                          },
                        },
                        IconTrash(),
                      ),
                    ),
                  ),
                ],
        ),
      );

      // ── 渲染：卡片主体 ──
      const card = h(
        'div',
        {
          className: 'dshm-card',
          'data-open': 'true',
          'data-skin': skin,
          'data-playing': playing,
        },
        // 整张卡的底：有封面就铺封面，没封面就一层淡品牌色晕染
        h(
          'div',
          { className: 'dshm-skin', 'aria-hidden': true },
          track && track.cover
            ? h('img', { className: 'dshm-skinimg', src: track.cover, alt: '' })
            : null,
          h('div', { className: 'dshm-skintint' }),
        ),
        h(
          'div',
          { className: 'dshm-head' },
          h(
            'div',
            { className: 'dshm-headtext' },
            h('div', { className: 'dshm-title' }, track ? track.title : t('title')),
            h(
              'div',
              {
                className: 'dshm-sub',
                style: status === 'error' ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined,
              },
              status === 'error' && message !== ''
                ? message
                : track
                  ? `${track.artist || '—'}${track.platform ? ' · ' + badgeOf(track.platform) : ''}`
                  : status === 'loading'
                    ? t('loading')
                    : t('lyricHint'),
            ),
          ),
          h(
            'button',
            {
              className: 'dshm-iconbtn',
              type: 'button',
              title: t('search'),
              'aria-label': t('search'),
              'data-active': panel === 'search',
              onClick: () => setPanel(panel === 'search' ? null : 'search'),
            },
            IconSearch(),
          ),
          h(
            'button',
            {
              className: 'dshm-iconbtn',
              type: 'button',
              title: t('playlist'),
              'aria-label': t('playlist'),
              'data-active': panel === 'playlist',
              onClick: () => setPanel(panel === 'playlist' ? null : 'playlist'),
            },
            IconList(),
          ),
        ),
        h(
          'div',
          { className: 'dshm-stage', ref: stageRef },
          h(
            'div',
            { className: 'dshm-swap', key: trackKey(track) || 'empty' },
            h('div', { className: 'dshm-fallback', 'data-hide': Boolean(track && track.cover && stage === 'cover') }, IconNote()),
            track && track.cover
              ? h('img', { className: 'dshm-cover', src: track.cover, alt: '', 'data-show': stage === 'cover' })
              : null,
            h(
              'div',
              { className: 'dshm-lyrics', 'data-show': showLyrics },
              lyrics.state === 'ready' && lyrics.hasTimeline
                ? h(
                    'div',
                    { className: 'dshm-lyrics-inner', style: { transform: `translateY(${-lyricsOffset}px)` } },
                    lyrics.lines.map((line, i) =>
                      h('div', { key: i, className: 'dshm-lrc-line', 'data-active': i === lyricIndex }, line.text),
                    ),
                  )
                : lyrics.state === 'ready'
                  ? h('div', { className: 'dshm-lrc-plain' }, lyrics.lines.map((line) => line.text).join('\n'))
                  : lyrics.state === 'loading'
                    ? h('div', { className: 'dshm-empty' }, t('loading'))
                    : h(
                        'div',
                        { className: 'dshm-empty' },
                        track === null
                          ? t('lyricHint')
                          : // 有时间轴但行数太少 = 纯音乐，别让用户对着「暂无歌词」发呆
                            lyrics.hasTimeline && lyrics.lines.length < 3 && track.cover
                            ? t('instrumental')
                            : t('noLyric'),
                      ),
            ),
          ),
          h('span', { className: 'dshm-eq', 'data-on': playing }, h('i', null), h('i', null), h('i', null)),
        ),
        h(
          'div',
          { className: 'dshm-progress' },
          h(
            'div',
            {
              className: 'dshm-track',
              'data-dragging': dragging,
              onPointerDown: (event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                scrubbingRef.current = true;
                setDragging(true);
                onTrackPointer(event);
              },
              onPointerMove: (event) => {
                if (scrubbingRef.current) onTrackPointer(event);
              },
              onPointerUp: (event) => {
                scrubbingRef.current = false;
                setDragging(false);
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                  /* 指针已经释放 */
                }
              },
              onPointerCancel: () => {
                scrubbingRef.current = false;
                setDragging(false);
              },
            },
            h('span', { className: 'dshm-fill', style: { transform: `scaleX(${progress})` }, 'data-dragging': dragging }),
            h('span', { className: 'dshm-knob', style: { left: `${progress * 100}%` } }),
          ),
          h('span', { className: 'dshm-time' }, formatTime(position)),
          h('span', { className: 'dshm-time' }, formatTime(duration || (track ? track.duration : 0))),
        ),
        h(
          'div',
          { className: 'dshm-controls' },
          h(
            'div',
            { className: 'dshm-sider dshm-sider-left' },
            // 音量：图标只是个门脸，指针移上去（或点一下让它拿到焦点）滑块才浮出来，
            // 这样不用为它腾地方，也不会把进度条顶来顶去。
            h(
              'div',
              {
                className: 'dshm-vol',
                'data-muted': volume === 0,
                title: t('volume'),
                onClick: () => {
                  const slider = volRef.current;
                  if (slider !== null) slider.focus();
                },
              },
              h('span', { className: 'dshm-volicon', 'aria-hidden': true }, volume === 0 ? IconMute(15) : IconVolume(15)),
              h(
                'div',
                { className: 'dshm-volpop' },
                h('input', {
                  ref: volRef,
                  className: 'dshm-range',
                  type: 'range',
                  min: 0,
                  max: 100,
                  step: 1,
                  value: Math.round(volume * 100),
                  'aria-label': t('volume'),
                  onChange: (event) => {
                    const next = Number(event.target.value) / 100;
                    setVolume(Math.max(0, Math.min(1, Number.isFinite(next) ? next : 0)));
                  },
                }),
                h('span', { className: 'dshm-volpct' }, `${Math.round(volume * 100)}%`),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dshm-center' },
            h(
              'button',
              { className: 'dshm-round', type: 'button', title: t('prev'), 'aria-label': t('prev'), onClick: () => step(-1) },
              IconPrev(),
            ),
            h(
              'button',
              {
                className: 'dshm-play',
                type: 'button',
                title: playing ? t('pause') : t('play'),
                'aria-label': playing ? t('pause') : t('play'),
                onClick: togglePlay,
              },
              h(
                'span',
                { style: { position: 'relative', display: 'block', width: '18px', height: '18px' } },
                icon('M8 5v14l11-7z', 18, { style: stackedIconStyle(!playing) }),
                icon('M7 5h4v14H7V5zm6 0h4v14h-4V5z', 18, { style: stackedIconStyle(playing) }),
              ),
            ),
            h(
              'button',
              { className: 'dshm-round', type: 'button', title: t('next'), 'aria-label': t('next'), onClick: () => step(1) },
              IconNext(),
            ),
          ),
          h(
            'div',
            { className: 'dshm-sider dshm-sider-right' },
            h(
              'button',
              {
                className: 'dshm-round',
                type: 'button',
                title: showLyrics ? t('cover') : t('lyric'),
                'aria-label': showLyrics ? t('cover') : t('lyric'),
                onClick: () => setStage(showLyrics ? 'cover' : 'lyrics'),
              },
              showLyrics ? IconLyric() : IconCover(),
            ),
          ),
        ),
        searchSheet,
        playlistSheet,
      );

      // 应用里没有圆按钮、也没有位置计算：整棵树交给下面的 mount 去挂进手机的容器。
      // 卡片自己铺满那 264 x 340 的屏幕，不再算宽高和圆角阴影。
      return h(
        'div',
        { className: 'dshm-app', ref: rootRef },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dshm-card', 'data-open': 'true', 'data-skin': skin, 'data-playing': playing },
          card,
        ),
      );
    }

    // ────────────────────────────── 挂载 ──────────────────────────────
    // 手机只给一块空的 DOM 容器，React 自己画不上去，得用渲染器把树挂进去。
    // react-dom 由手机提供（ctx.reactDOM）；拿不到就直接报错，不要静默白屏。

    const reactDOM = ctx.reactDOM;

    function createRenderer(container) {
      if (reactDOM === null || reactDOM === undefined) {
        throw new Error('手机没有提供 react-dom，音乐界面挂不上去');
      }
      if (typeof reactDOM.createRoot === 'function') {
        const root = reactDOM.createRoot(container);
        return {
          render: (node) => root.render(node),
          unmount: () => root.unmount(),
        };
      }
      // React 17 那套兜底：宿主哪天换了版本也不至于整块崩。
      if (typeof reactDOM.render === 'function') {
        return {
          render: (node) => reactDOM.render(node, container),
          unmount: () => reactDOM.unmountComponentAtNode(container),
        };
      }
      throw new Error('手机的 react-dom 既没有 createRoot 也没有 render');
    }

    const renderer = createRenderer(ctx.root);
    let alive = true;
    let painted = false;

    const paint = () => {
      if (!alive || painted) return;
      painted = true;
      renderer.render(h(MusicWidget));
    };

    // 先把私有设置（音量、搜索历史）读回来再画第一帧，
    // 否则音量会先按默认值闪一下，历史也会空一下。
    void settingsLoad().then(paint, paint);

    // 应用被切走 / 手机关掉 / 被卸载时，手机都会调这个。
    return function unmount() {
      alive = false;
      // 攒着的设置在卸载前必须落盘，否则刚拖的音量会丢。
      try {
        settingsFlush();
      } catch {
        /* 存不上就只影响这一次 */
      }
      // 音頻由 MusicWidget 自己的 effect 负责停（它会 pause、清 src、释放实例）。
      try {
        renderer.unmount();
      } catch {
        /* 树已经不在了 */
      }
      try {
        while (ctx.root.firstChild) ctx.root.removeChild(ctx.root.firstChild);
      } catch {
        /* 容器已经没了 */
      }
    };
};
