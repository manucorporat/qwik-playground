import "./App.css";
import Editor, {useMonaco} from "@monaco-editor/react";
import { useEffect, useMemo, useState, useRef } from "react";
import useDebounce from "./debounce";
import ResizePanel from "react-resize-panel";
import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";

import ListItemIcon from "@mui/material/ListItemIcon";
import ErrorIcon from '@mui/icons-material/Error';


import { createTheme, ThemeProvider } from '@mui/material/styles';

import { TabContext, TabList } from "@mui/lab";

const theme = createTheme();

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
    transpile: true,
    minify: 'none',
    entryStrategy: 'smart',
    view: 'bundles'
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
  const editorRef = useRef(null);
  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;
  }
  const monaco = useMonaco();
  const state = useMemo(() => getInitialState(), []);
  const [code, setCode] = useState(state.code);
  const [minify, setMinify] = useState(state.minify);
  const [entryStrategy, setEntryStrategy] = useState(state.entryStrategy);
  const [transpile, setTranspile] = useState(state.transpile);
  const [modules, setModules] = useState([]);
  const [bundles, setBundles] = useState([]);

  const [diagnostics, setDiagnostics] = useState([]);
  const [view, setView] = useState(state.view);

  const debouncedCode = useDebounce(code, 200);

  useEffect(() => {
    async function load() {
      if (window.qwikCompiler) {
        const opts = {
          rootDir: '/internal/project',
          transpile,
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
        const qk = await window.qwikCompiler;
        const result = qk(opts);
        setModules(result.modules);
        setDiagnostics(result.diagnostics);
        console.log(result.diagnostics);

        if (monaco) {
          for (const diagnostic of result.diagnostics) {
            monaco.editor.setModelMarkers(editorRef.current.getModel(), 'test', [
              {
                startLineNumber: diagnostic.code_highlights[0].loc.start_line,
                startColumn: diagnostic.code_highlights[0].loc.start_col,
                endLineNumber: diagnostic.code_highlights[0].loc.end_line,
                endColumn: diagnostic.code_highlights[0].loc.end_col,
                message: diagnostic.message,
                severity: "error",
              }
            ]);
          }
        }
        if (transpile) {

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
            console.log(generated.output);
            setBundles(generated.output.map(o => ({
              path: o.fileName,
              code: o.code,
              isEntry: o.isDynamicEntry
            })));
          } catch (error) {
            console.error(error);
          }
        }
      }
    }
    load();
  }, [
    debouncedCode,
    minify,
    entryStrategy,
    transpile,
    monaco
  ]);

  useEffect(() => {
    const state = JSON.stringify({
      code,
      minify,
      entryStrategy,
      transpile,
      view
    });
    window.location.hash = prefix + btoa(state);
  }, [
    code,
    minify,
    entryStrategy,
    transpile,
    view
  ]);

  const codes = view === 'bundles' && transpile ? bundles : modules;
  return (
    <ThemeProvider theme={theme}>
      <div className="App">
        <header>
          <a href="https://github.com/builderio/qwik" className="logo">
            <img alt="Qwik logo" src="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F667ab6c2283d4c4d878fb9083aacc10f"/>
          </a>
          Optimizer Playground

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
              onMount={handleEditorDidMount}
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
            <h2>Options</h2>
            <Stack direction="row" spacing={2} marginTop>
              <FormControl fullWidth>
                <InputLabel id="minification-label">Minification</InputLabel>
                <Select
                  labelId="minification-label"
                  id="minification-select"
                  value={minify}
                  label="Minification"
                  onChange={(_, v) => setMinify(v.props.value)}
                >
                  <MenuItem value="minify">minify</MenuItem>
                  <MenuItem value="simplify">simplify</MenuItem>
                  <MenuItem value="none">none</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="strategy-label">Entry strategy</InputLabel>
                <Select
                  labelId="strategy-label"
                  id="strategy-select"
                  value={entryStrategy}
                  label="Entry stategy"
                  onChange={(_, v) => setEntryStrategy(v.props.value)}
                >
                  <MenuItem value="single">single</MenuItem>
                  <MenuItem value="hook">hook</MenuItem>
                  <MenuItem value="component">component</MenuItem>
                  <MenuItem value="smart">smart</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel control={<Switch checked={transpile} onChange={(ev, v) => setTranspile(v)} />} label="Transpile" />

            </Stack>

            {diagnostics.length > 0 && (
              <>
                <CardContent className="diagnostics">
                  <Typography variant="h5" component="div">
                    Diagnostics
                  </Typography>
                    <List>
                      {diagnostics.map(diagnostic => (

                        <ListItem disablePadding>
                          <ListItemIcon>
                            <ErrorIcon/>
                          </ListItemIcon>
                          <ListItemText
                            primary={diagnostic.message}
                            secondary={
                              <>
                              Line {diagnostic.code_highlights[0].loc.start_line}
                              </>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                </CardContent>


              </>
            )}

            <h2>Output</h2>

            {transpile && (
              <TabContext value={view}>
                <TabList aria-label="lab API tabs example" onChange={(_, value) => setView(value)}>
                  <Tab label="Modules" value="modules" />
                  <Tab label="Bundles" value="bundles" />
                </TabList>
              </TabContext>
            )}
            <ul>
              {codes.map(mod => (
                <li className={mod.isEntry ? "is-entry" : undefined} key={mod.path}>
                  <button className="href" onClick={() => {
                    const element = document.getElementById(mod.path);
                    if (element && element.scrollIntoView) {
                      element.scrollIntoView();
                    }
                  }}>
                    {mod.path}
                  </button>
                  {mod.isEntry && "  (entry point)" }</li>
              ))}
            </ul>

            {codes.map(mod => {
              return (
                <Paper id={mod.path} className="chunk" key={mod.path} elevation={2}>
                  <h3>{mod.path}</h3>
                  <SyntaxHighlighter language="javascript" style={docco}>
                    {mod.code}
                  </SyntaxHighlighter>
                </Paper>
              )
            })}
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

