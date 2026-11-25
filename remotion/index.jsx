import React from 'react';
import { registerRoot, Composition, AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';

const FONT = 'Helvetica, Arial, sans-serif';

// classic: translucent box. bold: big uppercase with outline. karaoke: chunk of words, active word highlighted.
const Caption = ({ cap, t, style, height }) => {
  const pop = Math.min(1, Math.max(0, (t - cap.start) * 12));
  const base = { maxWidth: '88%', textAlign: 'center', fontFamily: FONT, lineHeight: 1.2, opacity: pop, transform: `scale(${0.92 + 0.08 * pop})` };

  if (style === 'bold') {
    return <div style={{ ...base, color: '#fff', fontWeight: 900, textTransform: 'uppercase', fontSize: height * 0.065,
      WebkitTextStroke: `${height * 0.008}px #000`, paintOrder: 'stroke fill', textShadow: '0 4px 12px rgba(0,0,0,.6)' }}>{cap.text}</div>;
  }
  if (style === 'karaoke' && cap.words) {
    return (
      <div style={{ ...base, fontWeight: 900, fontSize: height * 0.06, textTransform: 'uppercase' }}>
        {cap.words.map((w, i) => {
          const active = t >= w.start && t < w.end;
          return (
            <React.Fragment key={i}>
              {i > 0 ? ' ' : null}
              <span style={{ display: 'inline-block', margin: '0 0.12em', color: active ? '#ffd23f' : '#fff', transform: active ? 'scale(1.12)' : 'none',
                WebkitTextStroke: `${height * 0.007}px #000`, paintOrder: 'stroke fill', textShadow: '0 4px 12px rgba(0,0,0,.6)' }}>{w.text}</span>
            </React.Fragment>
          );
        })}
      </div>
    );
  }
  return <div style={{ ...base, color: '#fff', fontWeight: 800, fontSize: height * 0.05, padding: '0.25em 0.6em', background: 'rgba(0,0,0,.55)', borderRadius: 14 }}>{cap.text}</div>;
};

const Captioned = ({ videoSrc, captions, style = 'classic' }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;
  const cur = captions.find((c) => t >= c.start && t < c.end);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <OffthreadVideo src={videoSrc} />
      {cur && (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: height * 0.1 }}>
          <Caption cap={cur} t={t} style={style} height={height} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const Root = () => (
  <Composition id="Captioned" component={Captioned} width={1920} height={1080} fps={30} durationInFrames={30}
    defaultProps={{ videoSrc: '', captions: [], style: 'classic' }} />
);
registerRoot(Root);
