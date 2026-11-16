// Original direct-rendering Markdown parser. No runtime dependencies or cross-call state.
const punctuation = /[\p{P}\p{S}]/u;
const escapes = /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/;
const chars = {
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
};
function escape(s, all=false){
  return s.replace(all?/[&<>"']/g:/[<>"']|&(?!(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|\w+);)/g,c=>chars[c]);
}
function numeric(s){
  return s.replace(/&#(?:(\d{1,7})|[xX]([\da-fA-F]{1,6}));/g,(m,d,h)=>{
    let n=parseInt(d||h,d?10:16);
    return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'\ufffd';
  });
}
function unquote(s){
  return s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g,'$1');
}
function key(s){
  return s.toLowerCase().toUpperCase().replace(/\s+/g,' ').trim();
}
function url(s){
  try{
    return encodeURI(s).replace(/%25/g,'%');
  } catch{
    return null;
  }
}
function linkHtml(label,dest,title,image){
  dest=url(dest);
  if(dest===null)return image?escape(label):label;
  return image?'<img src="'+escape(dest)+'" alt="'+escape(label)+'"'+(title?' title="'+escape(title)+'"':'')+'>':'<a href="'+escape(dest)+'"'+(title?' title="'+escape(title)+'"':'')+'>'+label+'</a>';
}
function readLink(s,start){
  let i=start;
  while(/[ \t\n]/.test(s[i]||'')&&i<s.length)i++;
  let dest='',title='';
  if(s[i]==='<'){
    let a=++i;
    for(;     i<s.length;     i++){
      if(s[i]==='\\'){
        i++;
        continue;
      }
      if(s[i]==='>')break;
      if(s[i]==='\n'||s[i]==='<')return null;
    }
    if(i===s.length)return null;
    dest=s.slice(a,i++);
  }   else{
    let a=i,depth=0;
    for(;     i<s.length;     i++){
      let c=s[i];
      if(c==='\\'){
        i++;
        continue;
      }
      if(c==='(')depth++;
      else if(c===')'){
        if(!depth)break;
        depth--;
      } else if(c===' '||c==='\t'||c==='\n')break;
    }
    if(depth)return null;
    dest=s.slice(a,i);
  }
  const ws=i;
  while(i<s.length&&/[ \t\n]/.test(s[i]))i++;
  if(i>ws&&/["'(]/.test(s[i]||'')&&i<s.length){
    let q=s[i++],end=q==='('?')':q,a=i;
    for(;     i<s.length;     i++){
      if(s[i]==='\\'){
        i++;
        continue;
      }
      if(s[i]===end)break;
    }
    if(i===s.length)return null;
    title=s.slice(a,i++);
    while(i<s.length&&/[ \t\n]/.test(s[i]))i++;
  }
  return s[i]===')'?{
    end:i+1,dest:unquote(dest),title:unquote(title)
  }:null;
}
function validLabel(text){
  let depth=0;
  for(let i=0;   i<text.length;   i++){
    if(text[i]==='\\'){
      i++;
      continue;
    }
    if(text[i]==='[')depth++;
    else if(text[i]===']')depth--;
    else if(text[i]==='`'&&!depth){
      let tail=text.slice(i);
      if(/^``+$/.test(tail))return true;
      let m=/^`+(?!`)[^`]*?`+(?!`)/.exec(tail);
      if(!m)return false;
      i+=m[0].length-1;
    }
  }
  return true;
}
function maskCodeEscapes(s){
  if(!/[`\\]/.test(s))return s;
  let clean='',i=0;
  while(i<s.length){
    if(s[i]==='\\'&&escapes.test(s[i+1]||'')){
      clean+='++';
      i+=2;
      continue;
    }
    if(s[i]==='`'){
      let j=i+1;
      while(s[j]==='`')j++;
      let n=j-i,k=j,found=-1;
      while(k<s.length){
        k=s.indexOf('`',k);
        if(k<0)break;
        let e=k+1;
        while(s[e]==='`')e++;
        if(e-k===n){
          found=k;
          break;
        }
        k=e;
      }
      if(found>=0){
        clean+=s.slice(i,j)+s.slice(j,found).replace(/`/g,'+')+s.slice(found,found+n);
        i=found+n;
        continue;
      }
      clean+=s.slice(i,j);
      i=j;
      continue;
    }
    let stop=/[`\\]/g;
    stop.lastIndex=i+1;
    let hit=stop.exec(s),end=hit?hit.index:s.length;
    clean+=s.slice(i,end);
    i=end;
  }
  return clean;
}
// Preserve offsets while masking references, then escapes/code, then inline spans.
// The order matters when a label contains unmatched backticks.
function emphasisMask(s,refs){
  if(!/[`\\<\[]/.test(s))return s;
  let clean=s,i=0;
  const hide=x=>'['+'a'.repeat(Math.max(0,x.length-2))+']';
  // Reference masking follows the bracket structure, before inline rendering.
  let masked='',at=0;
  while(at<clean.length){
    if(clean[at]!=='['){
      let next=clean.indexOf('[',at+1);
      if(next<0)next=clean.length;
      masked+=clean.slice(at,next);
      at=next;
      continue;
    }
    let depth=1,end=at+1;
    for(;     end<clean.length;     end++){
      if(clean[end]==='\\'){
        end++;
        continue;
      }
      if(clean[end]==='[')depth++;
      else if(clean[end]===']'&&!--depth)break;
    }
    let close=end+1;
    if(depth===0&&clean[close]==='['){
      let stop=clean.indexOf(']',close+1),id=stop<0?'':clean.slice(close+1,stop),label=clean.slice(at+1,end);
      if(id&&refs[key(id)]&&validLabel(s.slice(at+1,end))&&!/(?<!!)\[[^\]]*\]\(/.test(label)){
        let nested=false;
        for(let m of label.matchAll(/(?<!!)\[([^\[\]]+)\](?:\[([^\[\]]*)\])?/g)){
          if(m[2]==='')continue;
          if(refs[key(m[2]||m[1])]){
            nested=true;
            break;
          }
        }
        if(!nested){
          masked+=hide(clean.slice(at,stop+1));
          at=stop+1;
          continue;
        }
      }
    }
    masked+=clean[at++];
  }
  clean=masked;
  clean=clean.replace(/\[([^\[\]]*)\]\[([^\[\]]*)\]|\[([^\[\]]*)\](?!\()/g,(m,a,b,c,offset)=>refs[key(b||a||c)]&&(!a||validLabel(s.slice(offset+1,offset+1+a.length)))?hide(m):m);
  clean=maskCodeEscapes(clean);
  let out='';
  i=0;
  while(i<clean.length){
    let tail=clean.slice(i),m;
    if(clean[i]==='<'&&(m=/^<[^<>]*>/.exec(tail))){
      out+=hide(m[0]);
      i+=m[0].length;
      continue;
    }
    if(clean[i]==='`'&&(i===0||clean[i-1]!=='`')&&(m=/^(`+)[^`]+\1(?!`)/.exec(tail))){
      out+=hide(m[0]);
      i+=m[0].length;
      continue;
    }
    if(clean[i]==='['){
      let j=i+1;
      for(;       j<clean.length;       j++){
        if(clean[j]==='`'){
          let q=/^(`+)[^`]+\1(?!`)/.exec(clean.slice(j));
          if(q){
            j+=q[0].length-1;
            continue;
          }
          j=clean.length;
          break;
        }
        if(clean[j]==='[')break;
        if(clean[j]===']')break;
      }
      if(clean[j]===']'&&clean[j+1]==='('){
        let r=readLink(clean,j+2);
        if(r){
          out+=hide(clean.slice(i,r.end));
          i=r.end;
          continue;
        }
      }
    }
    let stop=/[<`\[]/g;
    stop.lastIndex=i+1;
    let hit=stop.exec(clean),end=hit?hit.index:clean.length;
    out+=clean.slice(i,end);
    i=end;
  }
  return out;
}
function delimiterFlanks(text,at,len,c){
  let prev=at?String.fromCodePoint(text.codePointAt(at>1&&/[\uDC00-\uDFFF]/.test(text[at-1])?at-2:at-1)):'',next=at+len<text.length?String.fromCodePoint(text.codePointAt(at+len)):'',pw=!prev||/\s/.test(prev),nw=!next||/\s/.test(next),pp=(c!=='*'||prev!=='~')&&punctuation.test(prev),np=(c!=='*'||next!=='~')&&punctuation.test(next);
  let left=!nw&&(!np||pw||pp),right=!pw&&(!pp||nw||np);
  return {
    open:c==='_'?left&&(!right||pp):left,close:c==='_'?right&&(!left||np):right
  };
}
function inline(s, refs, inLink=undefined, plain=false){
  if(!/[\\<`\[*_~&\n@]|www\.|:\/\//.test(s)){
    refs.lastEmitted=false;
    refs.lastInLink=inLink===undefined?refs.inLink||false:inLink;
    return plain?s:escape(s,true);
  }
  let mask=null;
  let root=inLink===undefined;
  if(root)inLink=refs.inLink||false;
  let pieces=[],i=0,raw=false,emitted=false;
  const add=x=>pieces.push(x);
  while(i<s.length){
    let c=s[i],tail=s.slice(i),m;
    if(c==='\\'&&escapes.test(s[i+1]||'')&&i+1<s.length){
      add(plain?s[i+1]:escape(s[i+1],true));
      i+=2;
      continue;
    }
    if(c==='`'){
      let end=i+1;
      while(s[end]==='`')end++;
      let n=end-i,j=end,found=-1;
      while(j<s.length){
        j=s.indexOf('`',j);
        if(j<0)break;
        let k=j+1;
        while(s[k]==='`')k++;
        if(k-j===n){
          found=j;
          break;
        }
        j=k;
      }
      if(found>=0){
        let text=s.slice(end,found).replace(/\n/g,' ');
        if(text.startsWith(' ')&&text.endsWith(' ')&&/[^ ]/.test(text))text=text.slice(1,-1);
        add(plain?text:'<code>'+escape(text,true)+'</code>');
        i=found+n;
        continue;
      }
      add(s.slice(i,end));
      i=end;
      continue;
    }
    if(c==='<'&&(m=/^<([a-zA-Z][a-zA-Z\d+.-]{1,31}:[^\s<>]*|[a-zA-Z\d.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z\d](?:[a-zA-Z\d.-]*[a-zA-Z\d])?)>/.exec(tail))){
      let text=m[1],dest=/^[^:]+@/.test(text)?'mailto:'+text:text;
      add(plain?text:linkHtml(escape(text),dest,'',false));
      i+=m[0].length;
      continue;
    }
    if(c==='<'&&(m=/^(?:<!--(?:-?>|[\s\S]*?-->)|<\?[\s\S]*?\?>|<![A-Z][\s\S]*?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/[a-zA-Z][\w-]*\s*>|<[a-zA-Z][\w-]*(?:\s+[a-zA-Z_:][\w.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>)/.exec(tail))){
      let tag=m[0];
      if(/^<a\s/i.test(tag))inLink=true;
      if(/^<\/a\s*>/i.test(tag))inLink=false;
      if(/^<(?:pre|code|kbd|script)(?:\s|>)/i.test(tag))raw=true;
      if(/^<\/(?:pre|code|kbd|script)(?:\s|>)/i.test(tag))raw=false;
      add(tag);
      i+=tag.length;
      continue;
    }
    if(c==='['||(c==='!'&&s[i+1]==='[')){
      let image=c==='!',a=i+(image?2:1),depth=1,j=a;
      for(;       j<s.length;       j++){
        if(s[j]==='\\'){
          j++;
          continue;
        }
        if(s[j]==='`'&&depth===1){
          let q=/^``+(?=\])|^`+(?!`)[^`]*?`+(?!`)/.exec(s.slice(j));
          if(!q){
            j=s.length;
            break;
          }
          j+=q[0].length-1;
          continue;
        }
        if(s[j]==='<'){
          let tag=/^<(?:[^<>"']|"[^"]*"|'[^']*')*>/.exec(s.slice(j));
          if(tag){
            j+=tag[0].length-1;
            continue;
          }
        }
        if(s[j]==='[')depth++;
        if(s[j]===']'&&!--depth)break;
      }
      if(j<s.length){
        let label=s.slice(a,j),r=null,end=j+1;
        if(s[end]==='('){
          r=readLink(s,end+1);
          if(r)end=r.end;
        }
        if(!r){
          let id=label;
          if(s[end]==='['){
            let k=s.indexOf(']',end+1);
            if(k>=0&&!/(?<!\\)[\[\]]/.test(s.slice(end+1,k))){
              id=s.slice(end+1,k)||label;
              end=k+1;
            }
          }
          r=refs[key(id)]||null;
        }
        if(r){
          let text=inline(label,refs,true,image||plain);
          if(!image&&refs.lastEmitted){
            add('[');
            i++;
            continue;
          }
          if(!image)emitted=true;
          add(plain?text:linkHtml(text,r.dest,r.title,image));
          i=end;
          continue;
        }
      }
    }
    if(!inLink&&!plain&&(m=/^(mailto:|xmpp:)([a-zA-Z\d._+-]+@[a-zA-Z\d-]+(?:\.[a-zA-Z\d-]+)+)(?![\w-])/.exec(tail))){
      let t=m[0];
      if(m[1]==='xmpp:'){
        let r=/^\/[a-zA-Z\d@._+-]+/.exec(tail.slice(t.length));
        if(r)t+=r[0];
      }
      if(!/[-_]$/.test(t)){
        add(linkHtml(escape(t),t,'',false));
        i+=t.length;
        continue;
      }
    }
    if(!inLink&&!plain&&(m=/^(?:(?:[hH][tT][tT][pP][sS]?:\/\/|[fF][tT][pP]:\/\/|www\.)[^\s<]+|[a-zA-Z\d._+-]+@[a-zA-Z\d_-]+(?:\.[a-zA-Z\d_-]*[a-zA-Z\d])+(?![a-zA-Z0-9-]))/.exec(tail))){
      let t=m[0],old;
      if(!t.includes('://')&&!t.startsWith('www.')&&s[i+t.length]==='_'&&!s.slice(0,i).includes('_')){
        add(escape(t+'_'));
        i+=t.length+1;
        continue;
      }
      do{
        old=t;
        t=t.replace(/[?!.,:;*_~'"]+$/,'').replace(/&(?:[\w]+)?;?$/,'');
        let ends=[];
        for(let k=0;         k<t.length;         k++){
          if(t[k]==='('){
            let e=t.indexOf(')',k+1);
            if(e<0){
              t=t.slice(0,k);
              break;
            }
            k=e;
            ends.push(k);
          } else if(t[k]===')')ends.push(-1);
          else ends.push(k);
        }
        if(t.endsWith(')')&&ends.at(-1)===-1)t=t.slice(0,-1);
      }
      while(t!==old);
      let dest=t.startsWith('www.')?'http://'+t:!t.includes('://')?'mailto:'+t:t;
      add(linkHtml(escape(numeric(t)),dest,'',false));
      i+=t.length;
      continue;
    }
    if((c===' '||c==='\\')&&(m=/^(?: {2,}|\\)\n(?!\s*$)[ \t]*/.exec(tail))){
      add(plain?'':'<br>');
      i+=m[0].length;
      continue;
    }
    if(c==='\n'){
      add('\n');
      i++;
      continue;
    }
    if((c==='*'||c==='_'||c==='~')&&(mask??=emphasisMask(s,refs))){
      let j=i+1;
      while(s[j]===c)j++;
      let n=j-i;
      let runStart=i;
      while(runStart>0&&s[runStart-1]===c)runStart--;
      let fullLength=j-runStart;
      let maskPrev=mask[runStart-1]||'',openingAmbiguous=!!maskPrev.trim()&&(punctuation.test(s[j]||'')||c==='*'&&!punctuation.test(maskPrev));
      let f=delimiterFlanks(s,runStart,fullLength,c),balance=n,skipped=0,matched=false;
      if(f.open&&(c!=='~'||n<=2)){
        for(let k=j+(c==='*'?(mask.slice(j).match(/^[^_*]*__[^_*]*\*[^_*]*(?=__)/)?.[0].length||0):c==='_'?(mask.slice(j).match(/^[^_*]*\*\*[^_*]*_[^_*]*(?=\*\*)/)?.[0].length||0):0);         k<mask.length;         ){
          k=mask.indexOf(c,k);
          if(k<0)break;
          let end=k+1;
          while(mask[end]===c)end++;
          let count=end-k,g=delimiterFlanks(mask,k,count,c);
          if(c==='~'&&count!==n){
            k=end;
            continue;
          }
          if(g.open&&!g.close){
            balance+=count;
            k=end;
            continue;
          }
          if(g.close){
            if(i>runStart&&g.open&&g.close)break;
            if(c!=='~'&&(g.open||f.close||openingAmbiguous)&&fullLength%3&&(fullLength+count)%3===0){
              skipped+=count;
              k=end;
              continue;
            }
            balance-=count;
            if(balance<=0){
              let closing=Math.min(count,count+balance+skipped),use=c==='~'?n:Math.min(n,closing)%2?1:2;
              let until=k+closing,body=inline(s.slice(i+use,until-use),refs,inLink,plain),tag=c==='~'?'del':use===2?'strong':'em';
              inLink=refs.lastInLink;
              emitted ||= refs.lastEmitted;
              add(plain?body:'<'+tag+'>'+body+'</'+tag+'>');
              i=until;
              matched=true;
              break;
            }
          }
          k=end;
        }
      }
      if(matched)continue;
      if(!f.open){
        add(s.slice(i,j));
        i=j;
      } else{
        add(c);
        i++;
      }
      continue;
    }
    if(raw){
      add(c);
      i++;
      continue;
    }
    if(c==='&'&&(m=/^&#(?:(\d{1,7})|[xX]([\da-fA-F]{1,6}));/.exec(tail))){
      add(plain?numeric(m[0]):escape(numeric(m[0])));
      i+=m[0].length;
      continue;
    }
    if(c==='&'&&(m=/^&\w+;/.exec(tail))){
      add(m[0]);
      i+=m[0].length;
      continue;
    }
    const next=/[\\<!\[`*_~&\"'\n]| {2,}\n|[hH][tT][tT][pP][sS]?:\/\/|[fF][tT][pP]:\/\/|www\.|[A-Za-z0-9._+-]+@[A-Za-z0-9_-]+/g;
    next.lastIndex=i+1;
    let found=next.exec(s),end=found?found.index:s.length;
    add(plain?s.slice(i,end):escape(s.slice(i,end),true));
    i=end;
  }
  refs.lastEmitted=emitted;
  refs.lastInLink=inLink;
  if(root)refs.inLink=inLink;
  return pieces.join('');
}
function expandTabs(s,col=0){
  let out='';
  for(let c of s){
    let n=c==='\t'?4-col%4:1;
    out+=' '.repeat(n);
    col+=n;
  }
  return out;
}
const blockNames='address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem meta nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul'.split(' ');
const blockTag=new RegExp('^ {0,3}</?(?:'+blockNames.join('|')+')(?:[ \\t]|/?>|$)','i');
const bullet=/^( {0,3})([*+-]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/;
const fence=/^( {0,3})(`{3,}|~{3,})(.*)$/;
const rule=/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const heading=/^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/;
function isFence(s){
  let m=fence.exec(s);
  return m&&!(m[2][0]==='`'&&m[3].includes('`'))?m:null;
}
function htmlKind(s,interrupt=false){
  let m=/^ {0,3}<(script|pre|style|textarea)(?:[\s>]|$)/i.exec(s);
  if(m)return {
    end:new RegExp('</'+m[1]+'>','i')
  };
  if(/^ {0,3}<!--/.test(s))return {
    end:/-->/
  };
  if(/^ {0,3}<\?/.test(s))return {
    end:/\?>/
  };
  if(/^ {0,3}<![A-Z]/.test(s))return {
    end:/>/
  };
  if(/^ {0,3}<!\[CDATA\[/.test(s))return {
    end:/\]\]>/
  };
  if(blockTag.test(s))return {
  };
  if(!interrupt&&/^ {0,3}(?:<\/[a-zA-Z][\w-]*\s*>|<[a-zA-Z][\w-]*(?:\s+[a-zA-Z_:][\w.:-]*(?:\s*=\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s"'=<>`]+))?)*\s*\/?>)\s*$/.test(s))return {
  };
  return null;
}
function interrupt(s){
  let b=bullet.exec(s);
  return heading.test(s)||rule.test(s)||/^ {0,3}>/.test(s)||isFence(s)||htmlKind(s,true)||(b&&b[4]&&(!/^\d/.test(b[2])||/^1[.)]$/.test(b[2])));
}
function cells(s){
  let a=[],part='',escapeNext=false;
  for(let i=0;   i<s.length;   i++){
    if(s[i]==='|'&&!escapeNext){
      a.push(part.trim());
      part='';
    } else{
      part+=s[i];
    }
    if(s[i]==='\\')escapeNext=!escapeNext;
    else escapeNext=false;
  }
  a.push(part.trim());
  if(a[0]==='')a.shift();
  if(a.at(-1)==='')a.pop();
  return a.map(x=>x.replace(/\\\|/g,'|'));
}
function tableAlign(s){
  if(!/[:|]/.test(s)||!/^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(s))return null;
  return cells(s).map(x=>x.startsWith(':')?x.endsWith(':')?'center':'left':x.endsWith(':')?'right':null);
}
function stripQuote(line){
  return line.replace(/^( {0,3}>)([ \t]+)/,(_,prefix,ws)=>prefix+(ws.includes('\t')?expandTabs(ws,prefix.length):ws)).replace(/^ {0,3}> ?/,'');
}
// Keep marked chunks separate from lazy continuation lines. A list or nested
// quotation may consume a different amount of the continuation than a paragraph.
function rawSource(node){
  let text=node.sourceLines.slice(node.startLine,node.endLine).join('\n');
  return node.type==='list'?text.trimEnd():text;
}
function readQuote(lines,start,refs){
  let limit=start;
  while(limit<lines.length){
    let line=lines[limit];
    if(/^ {0,3}>/.test(line)){
      limit++;
      continue;
    }
    if(!line.trim()||limit===start||!stripQuote(lines[limit-1]).trim()||interrupt(line)||bullet.test(line))break;
    limit++;
  }
  let children=[],cursor=start;
  while(cursor<limit){
    let marked=/^ {0,3}>/.test(lines[cursor]),last=children.at(-1);
    if(!marked&&last){
      if(['code','heading','hr','html','table'].includes(last.type))break;
      if(last.type==='list'||last.type==='quote'){
        let suffix=lines.slice(cursor,limit);
        if(last.type==='quote')suffix=suffix.map(line=>line.replace(/^ {0,3}>[ \t]?/,''));
        let previousRaw=rawSource(last);
        let parsed=blocks(previousRaw+'\n'+suffix.join('\n'),refs,true,true),replacement=parsed[0];
        if(!replacement||replacement.type!==last.type)break;
        let used=rawSource(replacement).split('\n').length-previousRaw.split('\n').length;
        if(used<=0)break;
        children[children.length-1]=replacement;
        cursor+=used;
        if(cursor<limit&&!/^ {0,3}>/.test(lines[cursor]))break;
        continue;
      }
    }
    let end=cursor,seenMarker=false,chunk=[];
    while(end<limit){
      let isMarker=/^ {0,3}>/.test(lines[end]);
      if(!isMarker&&seenMarker)break;
      seenMarker ||= isMarker;
      let line=lines[end++];
      chunk.push(isMarker?stripQuote(line):/^ {0,3}(=+|-+)[ \t]*$/.test(line)?'    '+line.trim():line);
    }
    let parsed=blocks(chunk.join('\n'),refs,true,false,children.at(-1)?.type==='paragraph');
    if(chunk.at(-1)&&!chunk.at(-1).trim()&&parsed.at(-2)?.type==='paragraph')parsed.at(-2).text+='\n'+chunk.at(-1);
    for(let node of parsed){
      let prev=children.at(-1);
      if((node.type==='paragraph'||node.type==='code'&&node.indented)&&prev?.type==='paragraph'){
        prev.text+='\n'+node.text;
      } else children.push(node);
    }
    cursor=end;
  }
  return {
    node:{
      type:'quote',children,sourceLines:lines,startLine:start,endLine:cursor
    },end:cursor
  };
}
// Build structural nodes first so inline rendering can resolve forward references.
function blocks(source,refs,top=true,firstOnly=false,continuedParagraph=false){
  let lines=source.split('\n'),nodes=[],i=0;
  if(lines.at(-1)==='')lines.pop();
  while(i<lines.length){
    if(firstOnly&&nodes.length)break;
    let s=lines[i],m;
    if(!s.trim()){
      nodes.push({
        type:'space'
      });
      i++;
      continue;
    }
    if(/^(?: {4}| {0,3}\t)/.test(s)){
      let a=[];
      while(i<lines.length){
        if(/^(?: {4}| {0,3}\t)/.test(lines[i]))a.push(lines[i++].replace(/^(?: {0,3}\t| {4})/,''));
        else if(!lines[i].trim()){
          a.push('');
          i++;
        } else break;
      }
      let trailing=0;
      while(a.length&&!a.at(-1).trim()){
        a.pop();
        trailing++;
      }
      i-=trailing;
      let text=a.join('\n')+(!trailing&&(i<lines.length||source.endsWith('\n'))?'\n':'');
      let prev=nodes.at(-1);
      if(prev?.type==='paragraph')prev.text+='\n'+text;
      else nodes.push({
        type:'code',text,indented:true
      });
      continue;
    }
    if((m=isFence(s))){
      let a=[],indent=m[2][0]==='`'?m[1].length:0,run=m[2],lang=unquote(m[3].trim()).split(/\s/)[0];
      i++;
      let end=new RegExp('^ {0,3}'+run[0]+'{'+run.length+',} *$');
      while(i<lines.length&&!end.test(lines[i])){
        let line=lines[i++];
        if(indent)line=line.replace(new RegExp('^[ \t]{0,'+indent+'}'), '');
        a.push(line);
      }
      if(i<lines.length)i++;
      nodes.push({
        type:'code',text:a.join('\n'),lang
      });
      continue;
    }
    if((m=heading.exec(s))){
      let text=(m[2]||'').trim();
      text=text.replace(/(?:^|[ \t]+)#+[ \t]*$/,'').trim();
      nodes.push({
        type:'heading',depth:m[1].length,text
      });
      i++;
      continue;
    }
    if(rule.test(s)){
      nodes.push({
        type:'hr'
      });
      i++;
      continue;
    }
    if(/^ {0,3}>/.test(s)){
      let quote=readQuote(lines,i,refs);
      nodes.push(quote.node);
      i=quote.end;
      continue;
    }
    if((m=bullet.exec(s))){
      let listStart=i;
      let lastBlanks=0;
      let ordered=/^\d/.test(m[2]),marker=ordered?m[2].slice(-1):m[2],start=parseInt(m[2]),items=[],loose=false;
      while(i<lines.length){
        let b=bullet.exec(lines[i]);
        if(!b||(ordered?!/^\d/.test(b[2])||b[2].slice(-1)!==marker:b[2]!==marker)||rule.test(lines[i]))break;
        let base=b[1].length+b[2].length,ws=b[3]||'',rest=b[4]||'',width=0;
        for(let c of ws)width+=c==='\t'?4-(base+width)%4:1;
        if(!rest.trim())width=1;
        if(width>4){
          rest=' '.repeat(width-1)+rest;
          width=1;
        }
        if(!width)width=1;
        let indent=base+width,a=[rest],previous=rest,blank=false;
        i++;
        while(i<lines.length){
          let l=lines[i];
          if(!l.trim()){
            if(a.length===1&&!a[0]){
              a.push('');
              i++;
              break;
            }
            a.push('');
            blank=true;
            i++;
            continue;
          }
          let expanded=l.includes('\t')?l.replace(/^[ \t]+/,expandTabs):l;
          let spaces=expanded.match(/^ */)[0].length;
          if(spaces>=indent){
            a.push(expanded.slice(indent));
            previous=expanded.slice(indent);
            blank=false;
            i++;
            continue;
          }
          if(bullet.test(l)||rule.test(l)||interrupt(l)||/^ {0,3}(?:`{3,}|~{3,})/.test(l)||blank||/^ {0,3}(?:`{3,}|~{3,})/.test(previous||'')||heading.test(previous||'')||htmlKind(previous||'')||/^(?: {4}| {0,3}\t)/.test(previous||''))break;
          a.push(/^ {0,3}(?:=+|-+) *$/.test(l)?'    '+l.trim():l);
          previous=expanded.slice(indent);
          i++;
        }
        let trailing=a.length>1&&a.at(-1)==='';
        lastBlanks=0;
        while(a.length>1&&a.at(-1)===''){
          a.pop();
          lastBlanks++;
        }
        let task=/^\[[ xX]\][ \t]+\S/.test(a[0]||''),checked=task&&a[0][1]!==' ';
        let nextItem=rule.test(lines[i]||'')?null:bullet.exec(lines[i]||'');
        let itemText=a.join('\n');
        if(!nextItem||(ordered?!nextItem[2].endsWith(marker):nextItem[2]!==marker))itemText=itemText.trimEnd();
        else itemText+='\n'.repeat(lastBlanks);
        let children=blocks(itemText,refs,false);
        if(task&&children[0]?.type==='paragraph')children[0].text=children[0].text.replace(/^\[[ xX]\][ \t]+/,'');
        items.push({
          children,task,checked
        });
        let next=rule.test(lines[i]||'')?null:bullet.exec(lines[i]||'');
        if(children.some((x,j)=>x.type==='space'&&j>0)||trailing&&next&&(ordered?next[2].endsWith(marker):next[2]===marker))loose=true;
      }
      i-=lastBlanks;
      nodes.push({
        type:'list',ordered,start,items,loose,sourceLines:lines,startLine:listStart,endLine:i
      });
      top=true;
      continue;
    }
    let html=htmlKind(s);
    if(html){
      let a=[];
      if(html.end){
        while(i<lines.length){
          let l=lines[i++];
          a.push(l);
          if(html.end.test(l))break;
        }
      } else while(i<lines.length&&lines[i].trim())a.push(lines[i++]);
      nodes.push({
        type:'html',text:a.join('\n')+(i<lines.length?(html.end?lines[i]==='':!lines[i].trim())?'':'\n':source.endsWith('\n')?'\n':'')
      });
      continue;
    }
    // Definitions are collected before inline rendering, including forward references.
    if(!(continuedParagraph&&!nodes.length)&&(/^ {0,3}\[(?:\\.|[^\[\]\\])*\]:/.test(s)||/^ {0,3}\[[^\]]*$/.test(s))){
      let joined=lines.slice(i).join('\n'),d=/^ {0,3}\[((?:\\.|[^\[\]\\])+)\]:[ \t]*(?:\n[ \t]*)?(<[^>\n]*>|[^<\s][^\s]*)(?:(?:[ \t]+(?:\n[ \t]*)?|[ \t]*\n[ \t]*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?[ \t]*(?=\n|$)/.exec(joined);
      if(d&&key(d[1])&&!/\n[ \t]*\n/.test(d[0])){
        let dest=d[2].replace(/^<|>$/g,''),title=d[3]?d[3].slice(1,-1):'';
        let k=key(d[1]);
        if(!refs[k])refs[k]={
          dest:unquote(dest),title:unquote(title)
        };
        i+=d[0].split('\n').length;
        continue;
      }
    }
    let align=i+1<lines.length?tableAlign(lines[i+1]):null;
    if(align){
      let headers=cells(s);
      if(headers.length===align.length){
        i+=2;
        let rows=[];
        while(i<lines.length&&!/^ *$/.test(lines[i])&&!interrupt(lines[i])&&!/^(?: {4}| {0,3}\t)./.test(lines[i]))rows.push(cells(lines[i++]));
        nodes.push({
          type:'table',headers,align,rows
        });
        continue;
      }
    }
    let a=[s];
    i++;
    let depth=0;
    while(i<lines.length&&lines[i].trim()){
      if(/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i])){
        depth=lines[i].trim()[0]==='='?1:2;
        i++;
        break;
      }
      if(interrupt(lines[i])||!top&&bullet.test(lines[i]))break;
      if(i+1<lines.length&&tableAlign(lines[i+1])&&cells(lines[i]).length===tableAlign(lines[i+1]).length)break;
      if(!top&&/^(?: {4}| {0,3}\t)/.test(lines[i]))break;
      a.push(lines[i++]);
    }
    let text=depth?a.join('\n').trim():a.join('\n');
    if(!top&&!depth&&nodes.at(-1)?.textLike)nodes.at(-1).text+='\n'+text;
    else nodes.push({
      type:depth?'heading':'paragraph',depth,text,textLike:!top&&!depth
    });
  }
  return nodes;
}
function render(nodes,refs,tight=false){
  let out='';
  for(let n of nodes){
    switch(n.type){
      case 'space':break;
      case 'paragraph':out+=tight&&n.textLike?inline(n.text,refs):'<p>'+inline(n.text,refs)+'</p>\n';
      break;
      case 'heading':out+='<h'+n.depth+'>'+inline(n.text,refs)+'</h'+n.depth+'>\n';
      break;
      case 'hr':out+='<hr>\n';
      break;
      case 'code':out+='<pre><code'+(n.lang?' class="language-'+escape(n.lang)+'"':'')+'>'+escape(n.text.replace(/\n$/,''),true)+(n.text?'\n':'')+'</code></pre>\n';
      break;
      case 'html':out+=n.text;
      break;
      case 'quote':out+='<blockquote>\n'+render(n.children,refs)+'</blockquote>\n';
      break;
      case 'list':{
        let tag=n.ordered?'ol':'ul';
        out+='<'+tag+(n.ordered&&n.start!==1?' start="'+n.start+'"':'')+'>\n';
        for(let item of n.items){
          let body=render(item.children,refs,!n.loose);
          if(item.task){
            let checkbox='<input '+(item.checked?'checked="" ':'')+'disabled="" type="checkbox"> ';
            body=n.loose&&body.startsWith('<p>')?'<p>'+checkbox+body.slice(3):checkbox+body;
          }
          out+='<li>'+body+'</li>\n';
        }
        out+='</'+tag+'>\n';
        break;
      }
      case 'table':{
        out+='<table>\n<thead>\n<tr>\n';
        for(let j=0;         j<n.headers.length;         j++)out+='<th'+(n.align[j]?' align="'+n.align[j]+'"':'')+'>'+inline(n.headers[j],refs)+'</th>\n';
        out+='</tr>\n</thead>\n';
        if(n.rows.length){
          out+='<tbody>';
          for(let row of n.rows){
            out+='<tr>\n';
            for(let j=0;             j<n.headers.length;             j++)out+='<td'+(n.align[j]?' align="'+n.align[j]+'"':'')+'>'+inline(row[j]||'',refs)+'</td>\n';
            out+='</tr>\n';
          }
          out+='</tbody>';
        }
        out+='</table>\n';
        break;
      }
    }
  }
  return out;
}
export function parse(markdown){
  const refs=Object.create(null);
  return render(blocks(markdown.replace(/\r\n?/g,'\n'),refs),refs);
}
