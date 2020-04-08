exports.HTML_REGEX = /(<([^>]+)>)/gi;

exports.mapAbilities = (tokens) => {
  const tokenKeys = Object.keys(tokens);
  tokenKeys.forEach(
    (key) => (tokens[key] = tokens[key].replace(exports.HTML_REGEX, ""))
  );
  return tokens;
};
