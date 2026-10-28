import React, { memo, useEffect, useRef, useState } from 'react';


/** 只在失焦时写入共享 Provider 草稿；击键期间保持本地输入，避免整页重渲染。 */
function DraftInput({ value, onCommit, registerFlush, field, ...props }) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const latest = useRef({ text, onCommit, value });
  latest.current = { text, onCommit, value };
  const commit = () => {
    focused.current = false;
    if (latest.current.text !== value) latest.current.onCommit(latest.current.text);
    return latest.current.text;
  };
  useEffect(() => { if (!focused.current) setText(value); }, [value]);
  useEffect(() => {
    registerFlush?.(field, commit);
    return () => {
      registerFlush?.(field, null);
      if (focused.current && latest.current.text !== value) latest.current.onCommit(latest.current.text);
    };
  }, []);
  return <input {...props} value={text} onFocus={event => {
    focused.current = true;
    props.onFocus?.(event);
  }} onChange={event => {
    setText(event.target.value);
    props.onChange?.(event);
  }} onBlur={commit} />;
}

export const DraftTextInput = memo(DraftInput);
export const DraftNumberInput = memo(({ value, onCommit, registerFlush, field, ...props }) => {
  const [text, setText] = useState(value ? String(value) : '');
  const focused = useRef(false);
  const latest = useRef({ text, onCommit });
  latest.current = { text, onCommit };
  const commit = () => {
    focused.current = false;
    const value = latest.current.text === '' ? 0 : Number(latest.current.text);
    latest.current.onCommit(value);
    return value;
  };
  useEffect(() => { if (!focused.current) setText(value ? String(value) : ''); }, [value]);
  useEffect(() => {
    registerFlush?.(field, commit);
    return () => {
      registerFlush?.(field, null);
      if (focused.current) latest.current.onCommit(latest.current.text === '' ? 0 : Number(latest.current.text));
    };
  }, []);
  return <input {...props} value={text} onFocus={event => {
    focused.current = true;
    event.target.select();
  }} onChange={event => {
    setText(event.target.value.replace(/[^\d]/g, ''));
  }} onBlur={commit} />;
});
