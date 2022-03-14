const child_process = require('child_process')
const fs = require('fs')
const path = require('path')
const process = require('process')
const env = require('dotenv')

// Process name, requires setup emsdk within path
const emcc = 'emcc'

// Static paths required
const broadway = path.join(__dirname, '..', 'Broadway')
const src = path.join(broadway, 'Decoder', 'src')
const inc = path.join(broadway, 'Decoder', 'inc')
const out = path.join(__dirname, '..', 'build')

async function build() {
  // Build args
  const args = [
    '-m32',
    // '-O2',
    // '-g1',
    // '-Dxxx2yyy',
    '--memory-init-file', '1',
    // '--llvm-opts', '3',
    // '--llvm-lto', '3',
    '-sNO_EXIT_RUNTIME=1',
    '-sNO_FILESYSTEM=1',
    '-sSINGLE_FILE=1',
    // '-sNO_BROWSER=1',
    // '-sCORRECT_SIGNS=1',
    // '-sCORRECT_OVERFLOWS=1',
    '-sINITIAL_MEMORY=' + (50*1024*1024).toString(), // 50M
    // '-sFAST_MEMORY=' + str(50*1024*1024),
    '-sALLOW_MEMORY_GROWTH=1',
    '-sINVOKE_RUN=0',
    // '-sRELOOP=1',
    // '-sINLINING_LIMIT=50',
    // '-sOUTLINING_LIMIT=100',
    '-sDOUBLE_MODE=0',
    // '-sPRECISE_I64_MATH=0',
    // '-sSIMD=1',
    '-sAGGRESSIVE_VARIABLE_ELIMINATION=1',
    '-sALIASING_FUNCTION_POINTERS=1',
    '-sDISABLE_EXCEPTION_CATCHING=1',
    // '-sUSE_CLOSURE_COMPILER=1',
    // '-sFORCE_ALIGNED_MEMORY=1',
    '-sEXPORTED_FUNCTIONS=_broadwayGetMajorVersion,_broadwayGetMinorVersion,_broadwayInit,_broadwayExit,_broadwayCreateStream,_broadwayPlayStream,_broadwayOnHeadersDecoded,_broadwayOnPictureDecoded',
    // '--closure', '1',
    '--js-library', path.join(broadway, 'decoder', 'library.js')
  ]

  // Source files
  const files = [
    'h264bsd_transform.c',
    'h264bsd_util.c',
    'h264bsd_byte_stream.c',
    'h264bsd_seq_param_set.c',
    'h264bsd_pic_param_set.c',
    'h264bsd_slice_header.c',
    'h264bsd_slice_data.c',
    'h264bsd_macroblock_layer.c',
    'h264bsd_stream.c',
    'h264bsd_vlc.c',
    'h264bsd_cavlc.c',
    'h264bsd_nal_unit.c',
    'h264bsd_neighbour.c',
    'h264bsd_storage.c',
    'h264bsd_slice_group_map.c',
    'h264bsd_intra_prediction.c',
    'h264bsd_inter_prediction.c',
    'h264bsd_reconstruct.c',
    'h264bsd_dpb.c',
    'h264bsd_image.c',
    'h264bsd_deblocking.c',
    'h264bsd_conceal.c',
    'h264bsd_vui.c',
    'h264bsd_pic_order_cnt.c',
    'h264bsd_decoder.c',
    'H264SwDecApi.c',
    'extraFlags.c',
    'Decoder.c'
  ]

  if (process.env.BROADWAY_PRODUCTION === "true") {
    // Build with optimisation
    args.push('-O2')
  } else {
    // Build with extra debugging, no minify
    args.push('-g1')
  }

  // Prepend the source path to the source files
  const sources = files.map(
    function (file) {
      return path.join(src, file)
    })

  // Ensure output dir is available
  fs.mkdirSync(out, { recursive: true })

  // Build command using the args, the include/source
  // directory and output the javascript to our static
  // build dir created above
  const command = [emcc, `-I${src}`, `-I${inc}`, ...args, ...sources, '-o', path.join(out, 'avc.js')].join(' ')

  // Execute process
  const spawned = child_process.exec(
    command,
    function (err, stdout, stderr) {
      if (stdout.length > 0) {
        console.log(stdout)
      }

      if (stderr.length > 0) {
        console.error(stderr)
      }
    }
  )

  return new Promise(function (resolve, reject) {
    spawned.on('close', function (code) {
      resolve(code)
    })

    spawned.on('error', function (error) {
      reject(error)
    })
  })
}

async function buildAll () {
  // Load environment
  env.config()

  // Build avc.js from the c sources
  const code = await build()

  if (code !== 0) {
    throw new Error('non-zero exit code - compilation failed')
  }

  // Acquire the static components synchronously
  const decoderPrepend = fs.readFileSync(path.join(broadway, 'templates', 'DecoderPre.js'))
  const decoderAppend = fs.readFileSync(path.join(broadway, 'templates', 'DecoderPost.js'))

  // Load the built avc.js, and create a new file with
  // the finalized Decoder.js
  return new Promise(function (resolve, reject) {
    fs.readFile(
      path.join(out, 'avc.js'),
      null,
      function (err, data) {
        if (err !== null) {
          reject(err)
        } else {
          // Parse JS, attach prefix and append text bocks
          const js = decoderPrepend.toString() + data.toString('utf-8') + decoderAppend.toString()

          // Write new file
          fs.writeFileSync(
            path.join(out, 'Decoder.js'),
            js
          )

          // Complete
          resolve(0)
        }
      })
  })
}

buildAll()
  .then(function (code) {
    console.log(`exited with code ${code}`)
  })
  .catch(function (err) {
    console.error(err.message)
  })
