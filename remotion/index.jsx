import React from 'react';
import { registerRoot, Composition, AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';

const Captioned = ({ videoSrc, captions }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;
  const cur = captions.find((c) => t >= c.start && t < c.end);
  const pop = cur ? Math.min(1, (t - cur.start) * 12) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <OffthreadVideo src={videoSrc} />
      {cur && (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: height * 0.1 }}>
          <div style={{
            maxWidth: '85%', textAlign: 'center', color: '#fff', fontFamily: 'Helvetica, Arial, sans-serif',
            fontWeight: 800, fontSize: height * 0.05, lineHeight: 1.2, padding: '0.25em 0.6em',
            background: 'rgba(0,0,0,.55)', borderRadius: 14, transform: `scale(${0.9 + 0.1 * pop})`, opacity: pop,
          }}>{cur.text}</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const Root = () => (
  <Composition id="Captioned" component={Captioned} width={1920} height={1080} fps={30} durationInFrames={30}
    defaultProps={{ videoSrc: '', captions: [] }} />
);
registerRoot(Root);
