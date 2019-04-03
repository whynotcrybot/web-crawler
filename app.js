const axios = require('axios');
const { parse, TextNode } = require('node-html-parser');
const validUrl = require('valid-url');

const ORIGIN_URL = 'https://www.apple.com';
const WORD_TO_LOOK_FOR = 'reimagined';
const DEPTH_LIMIT = 1;

// Look for links on the page
function iterateOverHtml(html) {
  // holds found elements
  const linkNodes = [];
  const textNodes = [];

  // queue for iterative processing
  const queue = [html];

  // iterate over elements
  for (const element of queue) {
    const { childNodes, tagName } = element;

    if (tagName === 'a') linkNodes.push(element);
    if (element instanceof TextNode) textNodes.push(element);

    queue.push(...childNodes);
  }

  // filter and parse link nodes
  const parsedLinks = linkNodes
    .filter(link => {
      const href = link.attributes.href;

      if (!href) return false;

      const suspectDomain = href.substr(0, ORIGIN_URL.length);
      //const sameDomain = suspectDomain === ORIGIN_URL;
      const startsWithHttp = suspectDomain.substr(0, 4) === 'http';

      // /apple-arcade
      // https://itunes.apple.com

      const containsHash = href.includes('#');

      return !startsWithHttp && !containsHash && validUrl.isUri(ORIGIN_URL + href);
    })
    .map(link => {
      return ORIGIN_URL + link.attributes.href;
    });

  // parse found text nodes
  const parsedTexts = textNodes.filter(node => {
    return node.rawText
      .split(' ')
      .map(x => x.toLowerCase())
      .includes(WORD_TO_LOOK_FOR.toLowerCase());
  });

  return [parsedLinks, parsedTexts];
}

// URL Object holds depth and url
function makeUrlObject(url, parent) {
  return {
    depth: parent ? parent.depth + 1 : 0,
    url,
  };
}

// Result object holds url and found word occurence
function makeResultObject (url, text) {
  return {
    url,
    text,
  };
}

async function main() {
  const results = [];
  const visited = {};
  const queue = [makeUrlObject(ORIGIN_URL)];

  for (const urlObject of queue) {
    try {
      const { url, depth } = urlObject;

      if (visited[url]) continue;
      visited[url] = true;

      const page = await axios.get(url);

      const html = parse(page.data);

      const [links, texts] = iterateOverHtml(html);

      if (texts.length) {
        results.push(...texts.map(text => makeResultObject(url, text)));

        console.log('FOUND', results, url);
      }

      console.log('VISITED', Object.keys(visited).length)
      console.log('QUEUE', queue.length)
      console.log('DEPTH', depth)

      // if DEPTH_LIMIT is not exceeded, push new links to the queue
      if (depth < DEPTH_LIMIT) {
        const newLinks = links
          .filter(link => {
            const hasVisited = visited[link] !== undefined;
            const isQueued = queue.findIndex(urlObject => urlObject.url === link) > -1;

            return !hasVisited && !isQueued;
          })
          .map(link => makeUrlObject(link, urlObject))

        queue.push(...newLinks);
      }
    } catch (e) {
      console.error('Error', e);
      continue;
    }
  }

  console.log('results', results);

  return results;
}

main();
