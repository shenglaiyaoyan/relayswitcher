let guard = null;

export const setNavigationGuard = fn => { guard = fn; };
export const canLeavePage = resume => !guard || guard(resume);

export const handleHashNavigation = ({ location, parseHash, navigate, currentHash, replaceHash }) => () => {
  const route = parseHash();
  if (!route) return;
  const hash = location.hash;
  const previousHash = typeof currentHash === 'function' ? currentHash() : currentHash;
  let resumed = false;
  const go = () => { resumed = true; navigate({ ...route, hash }); };
  if (canLeavePage(go)) { if (!resumed) go(); }
  else if (!resumed) replaceHash(previousHash);
};
