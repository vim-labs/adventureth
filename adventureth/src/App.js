import React, { useState, useEffect } from "react";
import { createMuiTheme, makeStyles } from "@material-ui/core/styles";
import {
  Paper,
  Box,
  TextField,
  Button,
  AppBar,
  List,
  ListItem,
  Tab,
  Tabs,
  CircularProgress,
  ThemeProvider,
  Typography
} from "@material-ui/core";
import { initialize } from "zokrates-js";
import createHash from "create-hash";
import abi_adventureth from "./assets/adventureth.json";
import Web3 from "web3";
import { Switch, Route, BrowserRouter as Router } from "react-router-dom";

const adventurethAddress = "0x793f389cc1f7d42fa1f1bba68d16a1e00067cb04";

const useStyles = makeStyles(theme => ({
  field: {
    padding: theme.spacing(2)
  },
  button: {
    padding: `${theme.spacing(1)}px ${theme.spacing(2)}px`
  },
  list: {
    paddingTop: 0
  }
}));

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return <div>{value === index && children}</div>;
}

// Pad left with zeros if odd length
const zpad = x => (x.length % 2 == 0 ? x : "0" + x);

// Takes a buffer and returns a sha2-256 hash buffer.
const sha256 = b =>
  createHash("sha256")
    .update(b)
    .digest();

// Splits an array into chunks
const chunk = (arr, size) =>
  arr.reduce((all, one, i) => {
    const ch = Math.floor(i / size);
    all[ch] = [].concat(all[ch] || [], one);
    return all;
  }, []);

// Convert text to 4x 128-bit chunks
const textToChunks = plaintext => {
  // Encode plaintext to UTF-8 buffer
  const data = Buffer.from(plaintext, "utf-8").toString("hex");

  // Split data into 4 chunks (with leading zeros), then parse as ints
  const l_data = Math.ceil(data.length / 4);
  let chunks_data = data
    .split("")
    .reduce((all, one, i) => {
      const ch = Math.floor(i / l_data);
      all[ch] = [].concat(all[ch] || [], one);
      return all;
    }, [])
    .map(c => BigInt("0x" + zpad(c.join("")), 16).toString());

  if (chunks_data.length > 4) return console.error("Error: data overflow");

  // Pad with zeros
  while (chunks_data.length < 4) chunks_data = [0, ...chunks_data];
  return chunks_data;
};

// Convert utf-8 string to ZoKrates inputs
const textToInputs = plaintext => {
  const chunks_data = textToChunks(plaintext);

  // Parse address as Uint < P-1
  const addr = BigInt(adventurethAddress).toString();

  return [...chunks_data, addr];
};

const textToHash = plaintext => {
  // Hash data
  const chunks_data = textToChunks(plaintext);
  const dataChunkB = chunks_data.map(chunk => {
    const b = Buffer.alloc(16);
    const v = Buffer.from(zpad(BigInt(chunk).toString(16)), "hex");
    b.set(v, 16 - v.byteLength);
    return b;
  });

  const hBuffer = sha256(Buffer.concat(dataChunkB));
  const h0 = BigInt("0x" + hBuffer.slice(0, 16).toString("hex")).toString();
  const h1 = BigInt("0x" + hBuffer.slice(16, 32).toString("hex")).toString();

  return [h0, h1];
};

const vkFormat = vkRaw => {
  const vkObj = {};

  const vals1d = vkRaw
    .match(/[^\r\n]+/g)
    .map(line => line.split(" = ")[1])
    .map(v => v.split(",").map(v => v.replace(/\W/g, "")))
    .flat(2);

  vkObj.a = [vals1d[0], vals1d[1]];
  vkObj.b = [
    [vals1d[2], vals1d[3]],
    [vals1d[4], vals1d[5]]
  ];
  vkObj.gamma = [
    [vals1d[6], vals1d[7]],
    [vals1d[8], vals1d[9]]
  ];
  vkObj.delta = [
    [vals1d[10], vals1d[11]],
    [vals1d[12], vals1d[13]]
  ];
  vkObj.gamma_abc_len = vals1d[14];
  vkObj.gamma_abc = chunk(vals1d.slice(15), 2);

  return Object.values(vkObj);
};

// Converts a bytes32 -> uint256
const bytes32ToUint256 = b => web3.utils.toBN(b).toString();

// Converts bytes32 values in a 3d array to uint256 values
const toUintArr = arr =>
  arr.map(v1 =>
    v1.map(v2 =>
      v2.constructor === Array
        ? v2.map(v3 => bytes32ToUint256(v3))
        : bytes32ToUint256(v2)
    )
  );

const theme = createMuiTheme({});

export default () => {
  const classes = useStyles();

  const [solution, setSolution] = useState("");
  const [reward, setReward] = useState("0");
  const [ipfs, setIpfs] = useState("");
  const [prev, setPrev] = useState("0");
  const [next, setNext] = useState(null);
  const [tab, setTab] = useState(0);
  const [generated, setGenerated] = useState("");
  const [loadingGenerator, setLoadingGenerator] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);
  const [id, setId] = useState("");
  const [k0, setK0] = useState(null);
  const [solved, setSolved] = useState(false);
  const [solvers, setSolvers] = useState([]);
  const [operator, setOperator] = useState(null);

  let challengeId = null;
  if (window.location.hash.indexOf("0x") > -1) {
    challengeId = window.location.hash.replace(/\W/g, "");
  } else if (window.location.pathname.indexOf("0x") > -1) {
    challengeId = window.location.pathname.replace(/\W/g, "");
  }

  // Check if we're loading the site from the domain or elsewhere.
  const isIpfs = window.location.origin.indexOf("adventureth.com") === -1;

  // Grab url with trailing slash
  let baseUrl = location.protocol + "//" + location.host + location.pathname;
  if (baseUrl.slice(-1) !== "/") baseUrl += "/";

  const formatUrl = id => (isIpfs ? baseUrl + "#" : "/") + id;

  const handleTab = (_, newTab) => {
    setTab(newTab);
  };

  useEffect(() => {
    async function connectToWallet() {
      // Disable MetaMask refresh
      if (window.ethereum && window.ethereum.autoRefreshOnNetworkChange) {
        window.ethereum.autoRefreshOnNetworkChange = false;
      }

      // Abort if web3 is unavailable
      if (typeof window.web3 === "undefined") {
        setK0(undefined);
        return;
      }

      // Request permission for MetaMask (or similar) in-browser Ethereum wallet.
      window.web3 = new Web3(window.web3.currentProvider);
      await window.web3.currentProvider.enable();

      // Use the first account as the default account.
      try {
        const [k0] = await window.web3.eth.getAccounts();
        setK0(k0);
      } catch (err) {
        console.error(err);
        setK0(undefined);
      }

      if (challengeId) {
        const adventurethContract = new window.web3.eth.Contract(
          abi_adventureth,
          adventurethAddress
        );

        const _solver = await adventurethContract.methods
          .solver(challengeId)
          .call({ from: k0 });
        setSolved(_solver !== "0x0000000000000000000000000000000000000000");

        const _next = await adventurethContract.methods
          .next(challengeId)
          .call({ from: k0 });

        if (
          _next !==
            "0x08c379a000000000000000000000000000000000000000000000000000000000" &&
          _next !==
            "0x0000000000000000000000000000000000000000000000000000000000000000"
        ) {
          setNext(_next);
        }

        const _reward = await adventurethContract.methods
          .reward(challengeId)
          .call({ from: k0 });
        setReward(web3.utils.fromWei(_reward, "ether"));

        const _op = await adventurethContract.methods
          .operator(challengeId)
          .call({ from: k0 });
        setOperator(_op);

        const _ipfs = await adventurethContract.methods
          .getIPFS(challengeId)
          .call({ from: k0 });
        setIpfs(_ipfs);

        const totalSolvers = parseInt(
          await adventurethContract.methods
            .solvers(challengeId)
            .call({ from: k0 }),
          10
        );

        const _solvers = [];
        for (let i = 0; i < totalSolvers; i++) {
          const _solver = await adventurethContract.methods
            .solverByIndex(challengeId, i)
            .call({ from: k0 });
          _solvers.push(_solver);
        }
        setSolvers(_solvers);
      }
    }
    connectToWallet();
  }, []);

  const handleRegisterTxGen = async () => {
    setLoadingGenerator(true);
    const [h0, h1] = textToHash(solution);

    initialize().then(z => {
      const zok = [
        'import "hashes/sha256/512bitPacked" as sha256packed',
        "def main(private field a, private field b, private field c, private field d, field address) -> (field):",
        "  h = sha256packed([a, b, c, d])",
        `  h[0] == ${h0}`,
        `  h[1] == ${h1}`,
        "  return address"
      ];

      const artifacts = z.compile(zok.join("\n"), "main", () => {});
      const keypair = z.setup(artifacts.program);
      const { vk: vkRaw } = keypair;
      const vk = vkFormat(vkRaw);
      setId(web3.utils.soliditySha3(...vk.flat(3)));
      setGenerated(JSON.stringify(vk, null, 2));
      setLoadingGenerator(false);
    });
  };

  const handleCommitTxGen = async () => {
    setLoadingGenerator(true);
    const [h0, h1] = textToHash(solution);
    const inputs = textToInputs(solution);

    initialize().then(z => {
      const zok = [
        'import "hashes/sha256/512bitPacked" as sha256packed',
        "def main(private field a, private field b, private field c, private field d, field address) -> (field):",
        "  h = sha256packed([a, b, c, d])",
        `  h[0] == ${h0}`,
        `  h[1] == ${h1}`,
        "  return address"
      ];

      const artifacts = z.compile(zok.join("\n"), "main", () => {});
      const keypair = z.setup(artifacts.program);
      const computationResult = z.computeWitness(artifacts, inputs);

      let proof = { proof: [], inputs: [] };

      try {
        proof = JSON.parse(
          z.generateProof(
            artifacts.program,
            computationResult.witness,
            keypair.pk
          )
        );
      } catch (err) {
        console.error(err);
      }

      const proof_proof = Object.values(proof.proof);
      const proof_inputs = Object.values(proof.inputs);
      const p = [...proof_proof, proof_inputs];
      const proofHash = web3.utils.soliditySha3(...p.flat(3));

      setGenerated(proofHash);
      setLoadingGenerator(false);
    });
  };

  const handleSolveTxGen = async () => {
    setLoadingGenerator(true);
    const [h0, h1] = textToHash(solution);
    const inputs = textToInputs(solution);

    initialize().then(z => {
      const zok = [
        'import "hashes/sha256/512bitPacked" as sha256packed',
        "def main(private field a, private field b, private field c, private field d, field address) -> (field):",
        "  h = sha256packed([a, b, c, d])",
        `  h[0] == ${h0}`,
        `  h[1] == ${h1}`,
        "  return address"
      ];

      const artifacts = z.compile(zok.join("\n"), "main", () => {});
      const keypair = z.setup(artifacts.program);
      const computationResult = z.computeWitness(artifacts, inputs);
      let proof = { proof: [], inputs: [] };

      try {
        proof = JSON.parse(
          z.generateProof(
            artifacts.program,
            computationResult.witness,
            keypair.pk
          )
        );
      } catch (err) {
        console.error(err);
      }
      const proof_proof = Object.values(proof.proof);
      const proof_inputs = Object.values(proof.inputs);
      const p = toUintArr([...proof_proof, proof_inputs]);

      setGenerated(JSON.stringify(p));
      setLoadingGenerator(false);
    });
  };

  const handleRegisterTx = () => {
    setLoadingTx(true);

    const adventurethContract = new window.web3.eth.Contract(
      abi_adventureth,
      adventurethAddress
    );

    const p = prev === "0" || prev.length === 0 ? "0x0" : prev;
    const txParams = { from: k0 };

    if (reward && reward !== "0") {
      txParams.value = Web3.utils.toWei(reward, "ether");
    }

    let gen = [];
    try {
      gen = JSON.parse(generated);
    } catch (err) {
      console.error(err);
    }

    adventurethContract.methods
      .register(p, ...gen)
      .send(txParams)
      .on("confirmation", () => {
        setLoadingTx(false);
        setGenerated("");
        setSolution("");
      });
  };

  const handleCommitTx = () => {
    setLoadingTx(true);

    const adventurethContract = new window.web3.eth.Contract(
      abi_adventureth,
      adventurethAddress
    );

    adventurethContract.methods
      .commit(challengeId, generated)
      .send({ from: k0 })
      .on("confirmation", () => {
        setLoadingTx(false);
        setGenerated("");
        setSolution("");
        setId("");
      });
  };

  const handleSolveTx = () => {
    setLoadingTx(true);

    const adventurethContract = new window.web3.eth.Contract(
      abi_adventureth,
      adventurethAddress
    );

    adventurethContract.methods
      .solve(challengeId, ...JSON.parse(generated))
      .send({ from: k0 })
      .on("confirmation", () => {
        setLoadingTx(false);
        setGenerated("");
        setSolution("");
        setId("");
      })
      .on("receipt", receipt => {
        if (receipt.events.length > 0) {
          setSolved(true);
        }
      });
  };

  const handleUpdateIpfs = () => {
    setLoadingGenerator(true);

    const adventurethContract = new window.web3.eth.Contract(
      abi_adventureth,
      adventurethAddress
    );

    adventurethContract.methods
      .setIPFS(challengeId, ipfs)
      .send({ from: k0 })
      .on("confirmation", () => {
        setLoadingGenerator(false);
        setGenerated("");
        setSolution("");
        setId("");
        setTab(0);
      });
  };

  return (
    <div id="app">
      <main role="main">
        <Box paddingX={2} marginY={1}>
          <Box
            width={540}
            display="flex"
            flexDirection="column"
            alignItems="center"
          >
            <img src="logo.png" width={320} alt="Logo" />
            <Typography>Adventures with Ethereum zkSNARKs.</Typography>
            <Typography variant="caption" style={{ marginTop: "8px" }}>
              Zero-knowledge succinct non-interactive argument of knowledge
              proofs (zkSNARKs) allow statements to be proven without revealing
              the details referenced within these statements. In Adventureth,
              these allow participants to prove on a blockchain that they have
              obtained a valid solution to a challenge without revealing their
              solution.
            </Typography>
            <Typography variant="caption" style={{ marginTop: "8px" }}>
              To add a new challenge, visit{" "}
              <a href="https://adventureth.com">https://adventureth.com</a> then
              register the solution with an optional reward. Challenge operators
              can set an IPFS address to present participants with details for
              the level. New challenges can reference previous challenge IDs to
              link continued gameplay.
            </Typography>
            <Typography variant="caption" style={{ marginTop: "8px" }}>
              To participate in a challenge, visit
              https://adventureth.com/&lt;challenge&gt;. The first valid
              solution receives a reward bounty less a 2.5% fee. Solutions are
              first posted as a commit before the proof is revealed. Each valid
              proof receives a collectible Adventureth NFT recognizing the
              achievement.{` `}
              <a
                href={formatUrl(
                  "0xd77018c3f8a98f399cfbf86227b1f5c654edb746dce5b3892d719915983f1b26"
                )}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Good luck.
              </a>
            </Typography>
            {k0 === undefined && (
              <Typography
                variant="caption"
                style={{ marginTop: "8px", fontWeight: "bold" }}
              >
                This application requires a Web3-enabled browser. Get{" "}
                <a
                  rel="noopener noreferrer nofollow"
                  href="https://metamask.io"
                >
                  MetaMask
                </a>
                .
              </Typography>
            )}
          </Box>
        </Box>
        <Router>
          <Switch>
            <Route path="/*">
              <ThemeProvider theme={theme}>
                <Box paddingX={2}>
                  <Box width={540}>
                    <AppBar position="static">
                      <Tabs value={tab} onChange={handleTab}>
                        {challengeId && [
                          <Tab key="commit" label="Commit solution" id={0} />,
                          <Tab key="solve" label="Solve challenge" id={1} />,
                          operator && (
                            <Tab key="ipfs" label="Update IPFS" id={2} />
                          )
                        ]}
                        {!challengeId && (
                          <Tab label="Create a new level" id={0} />
                        )}
                      </Tabs>
                    </AppBar>
                  </Box>
                </Box>
                {challengeId && (
                  <>
                    <TabPanel value={tab} index={0}>
                      <Box padding={2}>
                        <Box width={540}>
                          <Paper>
                            <Box padding={2}>
                              <Box display="flex">
                                <Box flexGrow={1} marginRight={0.5}>
                                  <TextField
                                    InputProps={{
                                      classes: { input: classes.field }
                                    }}
                                    variant="outlined"
                                    value={challengeId}
                                    placeholder={"0x0"}
                                    label={"Challenge Identifier"}
                                    readOnly
                                    fullWidth
                                  />
                                </Box>
                                <Box flexGrow={1} marginLeft={0.5}>
                                  <TextField
                                    InputProps={{
                                      classes: { input: classes.field }
                                    }}
                                    variant="outlined"
                                    value={solution}
                                    onChange={e =>
                                      setSolution(e.currentTarget.value)
                                    }
                                    placeholder={"hello world"}
                                    label={"Solution"}
                                    autoFocus
                                    fullWidth
                                  />
                                </Box>
                              </Box>
                              <Box
                                display="flex"
                                alignItems="center"
                                marginTop={2}
                              >
                                {solved ? (
                                  <Typography
                                    style={{ fontWeight: "bold" }}
                                    color="primary"
                                    variant="caption"
                                  >
                                    SOLVED
                                  </Typography>
                                ) : (
                                  <Typography
                                    style={{ fontWeight: "bold" }}
                                    color="primary"
                                    variant="caption"
                                  >
                                    UNSOLVED - Reward: {reward}ETH
                                  </Typography>
                                )}
                                <Box flexGrow={1}></Box>
                                {loadingGenerator && (
                                  <CircularProgress size={24} />
                                )}
                                <Box marginLeft={2}>
                                  <Button
                                    classes={{ root: classes.button }}
                                    variant="contained"
                                    color="primary"
                                    disabled={!k0 || loadingGenerator}
                                    onClick={handleCommitTxGen}
                                  >
                                    Generate
                                  </Button>
                                </Box>
                              </Box>
                            </Box>
                          </Paper>
                          <Box marginTop={2}>
                            <TextField
                              readOnly
                              fullWidth
                              placeholder="0x0"
                              label="Proof hash"
                              variant="outlined"
                              value={generated}
                            />
                          </Box>
                          <Box display="flex" alignItems="center" marginTop={2}>
                            {next && (
                              <Button
                                classes={{ root: classes.button }}
                                variant="outlined"
                              >
                                Next
                              </Button>
                            )}
                            <Box flexGrow={1}></Box>
                            {loadingTx && <CircularProgress size={24} />}
                            {ipfs != "" && (
                              <Box marginLeft={2}>
                                <Button
                                  classes={{ root: classes.button }}
                                  variant="outlined"
                                  onClick={() =>
                                    window.open(
                                      "https://ipfs.io/ipfs/" + ipfs,
                                      "_blank"
                                    )
                                  }
                                >
                                  View on IPFS
                                </Button>
                              </Box>
                            )}
                            <Box marginLeft={2}>
                              <Button
                                classes={{ root: classes.button }}
                                variant="contained"
                                color="primary"
                                disabled={
                                  loadingTx || !k0 || !challengeId || !generated
                                }
                                onClick={handleCommitTx}
                              >
                                Commit
                              </Button>
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    </TabPanel>
                    <TabPanel value={tab} index={1}>
                      <Box padding={2}>
                        <Box width={540}>
                          <Paper>
                            <Box padding={2}>
                              <Box display="flex">
                                <Box flexGrow={1} marginRight={0.5}>
                                  <TextField
                                    InputProps={{
                                      classes: { input: classes.field }
                                    }}
                                    variant="outlined"
                                    value={challengeId}
                                    placeholder={"0x0"}
                                    label={"Challenge Identifier"}
                                    readOnly
                                    fullWidth
                                  />
                                </Box>
                                <Box flexGrow={1} marginLeft={0.5}>
                                  <TextField
                                    InputProps={{
                                      classes: { input: classes.field }
                                    }}
                                    variant="outlined"
                                    value={solution}
                                    onChange={e =>
                                      setSolution(e.currentTarget.value)
                                    }
                                    placeholder={"hello world"}
                                    label={"Solution"}
                                    autoFocus
                                    fullWidth
                                  />
                                </Box>
                              </Box>
                              <Box
                                display="flex"
                                alignItems="center"
                                justifyContent="flex-end"
                                marginTop={2}
                              >
                                {loadingGenerator && (
                                  <CircularProgress size={24} />
                                )}
                                <Box marginLeft={2}>
                                  <Button
                                    classes={{ root: classes.button }}
                                    variant="contained"
                                    color="primary"
                                    disabled={!k0 || loadingGenerator}
                                    onClick={handleSolveTxGen}
                                  >
                                    Generate
                                  </Button>
                                </Box>
                              </Box>
                            </Box>
                          </Paper>
                          <Box marginTop={2}>
                            <TextField
                              readOnly
                              multiline
                              fullWidth
                              rows={8}
                              label="Proof"
                              variant="outlined"
                              value={generated}
                            />
                          </Box>
                          <Box
                            display="flex"
                            alignItems="center"
                            justifyContent="flex-end"
                            marginTop={2}
                          >
                            {loadingTx && <CircularProgress size={24} />}
                            {ipfs != "" && (
                              <Box marginLeft={2}>
                                <Button
                                  classes={{ root: classes.button }}
                                  variant="outlined"
                                  onClick={() =>
                                    window.open(
                                      "https://ipfs.io/ipfs/" + ipfs,
                                      "_blank"
                                    )
                                  }
                                >
                                  View on IPFS
                                </Button>
                              </Box>
                            )}
                            <Box marginLeft={2}>
                              <Button
                                classes={{ root: classes.button }}
                                variant="contained"
                                color="primary"
                                disabled={
                                  loadingTx || !k0 || !challengeId || !generated
                                }
                                onClick={handleSolveTx}
                              >
                                Solve
                              </Button>
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    </TabPanel>
                    {operator && (
                      <TabPanel value={tab} index={2}>
                        <Box padding={2}>
                          <Box width={540}>
                            <Paper>
                              <Box padding={2}>
                                <Box display="flex">
                                  <TextField
                                    InputProps={{
                                      classes: { input: classes.field }
                                    }}
                                    variant="outlined"
                                    value={ipfs}
                                    onChange={e =>
                                      setIpfs(e.currentTarget.value)
                                    }
                                    placeholder={
                                      "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o"
                                    }
                                    label={"IPFS address"}
                                    autoFocus
                                    fullWidth
                                  />
                                </Box>
                                <Box
                                  display="flex"
                                  alignItems="center"
                                  justifyContent="flex-end"
                                  marginTop={2}
                                >
                                  {loadingGenerator && (
                                    <CircularProgress size={24} />
                                  )}
                                  <Box marginLeft={2}>
                                    <Button
                                      classes={{ root: classes.button }}
                                      variant="contained"
                                      color="primary"
                                      disabled={!k0 || loadingGenerator}
                                      onClick={handleUpdateIpfs}
                                    >
                                      Update
                                    </Button>
                                  </Box>
                                </Box>
                              </Box>
                            </Paper>
                          </Box>
                        </Box>
                      </TabPanel>
                    )}
                  </>
                )}
                {!challengeId && (
                  <TabPanel value={tab} index={0}>
                    <Box padding={2}>
                      <Box width={540}>
                        <Paper>
                          <Box padding={2}>
                            <Box display="flex">
                              <Box flexGrow={1} marginRight={0.5}>
                                <TextField
                                  InputProps={{
                                    classes: { input: classes.field }
                                  }}
                                  variant="outlined"
                                  value={prev}
                                  onChange={e => setPrev(e.currentTarget.value)}
                                  placeholder={"0x0"}
                                  label={"Previous Challenge ID"}
                                  fullWidth
                                />
                              </Box>
                              <Box flexGrow={1} marginLeft={0.5}>
                                <TextField
                                  InputProps={{
                                    classes: { input: classes.field }
                                  }}
                                  variant="outlined"
                                  value={solution}
                                  onChange={e =>
                                    setSolution(e.currentTarget.value)
                                  }
                                  placeholder={"hello world"}
                                  label={"Solution"}
                                  autoFocus
                                  fullWidth
                                />
                              </Box>
                              <Box width={96} marginLeft={0.5}>
                                <TextField
                                  InputProps={{
                                    classes: { input: classes.field }
                                  }}
                                  variant="outlined"
                                  value={reward}
                                  onChange={e =>
                                    setReward(e.currentTarget.value)
                                  }
                                  placeholder={"0.001"}
                                  label={"Reward"}
                                />
                              </Box>
                            </Box>
                            <Box
                              display="flex"
                              alignItems="center"
                              justifyContent="flex-end"
                              marginTop={2}
                            >
                              {loadingGenerator && (
                                <CircularProgress size={24} />
                              )}
                              <Box marginLeft={2}>
                                <Button
                                  classes={{ root: classes.button }}
                                  variant="contained"
                                  color="primary"
                                  disabled={!k0 || loadingGenerator}
                                  onClick={handleRegisterTxGen}
                                >
                                  Generate
                                </Button>
                              </Box>
                            </Box>
                          </Box>
                        </Paper>
                        <Box marginTop={1}>
                          <TextField
                            readOnly
                            multiline
                            fullWidth
                            rows={8}
                            label="Verification key"
                            variant="outlined"
                            value={generated}
                          />
                        </Box>
                        <Box marginTop={2}>
                          <TextField
                            InputProps={{ classes: { input: classes.field } }}
                            variant="outlined"
                            value={id}
                            placeholder={"0x0"}
                            label={"Challenge Identifier"}
                            readOnly
                            fullWidth
                          />
                        </Box>
                        <Box
                          display="flex"
                          alignItems="center"
                          justifyContent="flex-end"
                          marginTop={2}
                        >
                          {loadingTx && <CircularProgress size={24} />}
                          {id !== "" && (
                            <Box marginLeft={2}>
                              <Button
                                classes={{ root: classes.button }}
                                variant="outlined"
                                disabled={!id}
                                onClick={() =>
                                  window.open(formatUrl(id), "_blank")
                                }
                              >
                                View
                              </Button>
                            </Box>
                          )}
                          <Box marginLeft={2}>
                            <Button
                              classes={{ root: classes.button }}
                              variant="contained"
                              color="primary"
                              disabled={loadingTx || !k0 || !id || !generated}
                              onClick={handleRegisterTx}
                            >
                              Register
                            </Button>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </TabPanel>
                )}
                {solvers.length > 0 && (
                  <Box paddingX={2}>
                    <Typography variant="caption" style={{ margin: 0 }}>
                      SOLVED BY:
                    </Typography>
                    <Box width={540}>
                      <List classes={{ root: classes.list }}>
                        <ListItem divider key="solverDiv" />
                        {solvers.map((address, idx) => (
                          <>
                            <ListItem key={address} divider>
                              <Typography
                                style={{
                                  fontWeight: idx == 0 ? "bold" : "normal"
                                }}
                              >
                                {idx + 1}: {address}
                              </Typography>
                            </ListItem>
                          </>
                        ))}
                      </List>
                    </Box>
                  </Box>
                )}
              </ThemeProvider>
            </Route>
          </Switch>
        </Router>
      </main>
    </div>
  );
};
