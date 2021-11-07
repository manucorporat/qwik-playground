import "./App.css";
import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import useDebounce from "./debounce";
import ResizePanel from "react-resize-panel";
import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';


const prefix = "#";

const INIT = `import { qComponent, qHook, h, useEvent } from '@builder.io/qwik';

export const Greeter = qComponent({
  onRender: qHook((props) => (
    <div>
      <div>
        Your name:
        <input
          value={props.name}
          on:keyup={qHook<typeof Greeter>(
            (props) => (props.name = (useEvent<KeyboardEvent>().target as HTMLInputElement).value)
          )}
        />
      </div>
      <span>Hello {props.name}!</span>
    </div>
  )),
});

`;
const getInitialState = () => {
  let fragment = getFragment();
  if (fragment !== "") {
    return JSON.parse(atob(fragment));
  }
  return {
    code: INIT,
    transpile: false,
    minify: 'none',
    entryStrategy: 'smart'
  };
};

const getFragment = () => {
  const fragment = window.location.hash;
  if (fragment.startsWith(prefix)) {
    return fragment.slice(prefix.length);
  }
  return "";
};

export default function App() {
  const state = useMemo(() => getInitialState(), []);
  const [code, setCode] = useState(state.code);
  const [minify, setMinify] = useState(state.minify);
  const [entryStrategy, setEntryStrategy] = useState(state.entryStrategy);
  const [modules, setModules] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [view, setView] = useState("modules");

  const debouncedCode = useDebounce(code, 200);

  useEffect(() => {
    async function load() {
      if (window.qwikCompiler) {
        const opts = {
          rootDir: '/internal/project',
          transpile: true,
          minify,
          entryStrategy,
          sourceMaps: false,
          input: [
            {
              path: 'input.tsx',
              code: debouncedCode
            }
          ]
        };
        console.log(opts);
        const qwikCompiler = await window.qwikCompiler;
        const result = qwikCompiler(opts);
        setModules(result.modules);

        const inputOptions = {
          plugins: [
            {
              resolveId(importee, importer) {
                if (!importer) return importee;
                if (importee[0] !== '.') return false;

                return importee + '.js';
              },
              load: function (id) {
                const found = result.modules.find(p => id.includes(p.path));
                if (found) {
                  return found.code;
                }
                return null;
              }
            }
          ],
          onwarn(warning) {
            console.warn(warning);
          }
        };
        inputOptions.input = 'input.js';

        try {
          const generated = await (await window.rollup.rollup(inputOptions)).generate({
            format: 'es'
          });
          setBundles(generated.output.map(o => ({
            path: o.fileName,
            code: o.code
          })));
        } catch (error) {
          console.error(error);
        }
      }
    }
    load();
  }, [
    debouncedCode,
    minify,
    entryStrategy,
  ]);

  useEffect(() => {
    const state = JSON.stringify({
      code,
      minify,
      entryStrategy,
    });
    window.location.hash = prefix + btoa(state);
  }, [
    code,
    minify,
    entryStrategy,
  ]);

  const codes = view === 'modules' ? modules : bundles;
  return (
    <div className="App">
      <header>
        <a href="https://github.com/builderio/qwik" className="logo">
          <img alt="Qwik logo" src="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F667ab6c2283d4c4d878fb9083aacc10f"/>
        </a>
        Optimizer Playground
        <select
          value={minify}
          onChange={(ev) => {
            const value = ev.target.value;
            setMinify(value);
          }}
        >
          <option value="minify">Minify: minify</option>
          <option value="simplify">Minify: simplify</option>
          <option value="none">Minify: none</option>

        </select>

        <select
          value={entryStrategy}
          onChange={(ev) => {
            const value = ev.target.value;
            setEntryStrategy(value);
          }}
        >
          <option value="smart">Strategy: smart</option>
          <option value="single">Strategy: single</option>
          <option value="hook">Strategy: hook</option>
          <option value="component">Strategy: component</option>
        </select>
        <nav className="top-menu">
          <a
            className="link"
            target="_blank"
            rel="noreferrer"
            href="https://github.com/BuilderIO/qwik/tree/main/integration"
          >
            Docs
          </a>
        </nav>
      </header>
      <div className="panel">
        <ResizePanel
          direction="e"
          style={{
            width: "50%",
          }}
        >
          <Editor
            width="100%"
            height="100%"
            language="typescript"
            beforeMount={(monaco) => {
              monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                validate: false,
              });

              monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                jsx: true,
              });

              monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                noSemanticValidation: true,
                noSyntaxValidation: true,
              });

            }}
            options={{
              scrollBeyondLastLine: false,
              minimap: {
                enabled: false,
              },
            }}
            onChange={(value) => {
              setCode(value);
            }}
            value={code}
          />
        </ResizePanel>
        <div className="output-code">
          <select
            value={view}
            onChange={(ev) => {
              const value = ev.target.value;
              setView(value);
            }}
          >
            <option value="modules">Modules</option>
            <option value="chunks">Bundles</option>
          </select>
          {codes.map(mod => {
            return (
              <div className="chunk">
                <h2>{mod.path}</h2>
                <SyntaxHighlighter language="javascript" style={docco}>
                  {mod.code}
                </SyntaxHighlighter>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
}

