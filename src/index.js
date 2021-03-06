// import LefitMobileCrop from '../dist/lefit-mobile-crop.min.js'
import LefitMobileCrop from './lefit-mobile-crop'

document.getElementById('testInput').onchange = function (evt) {
  let file = evt.target.files[0]
  window.crop = new LefitMobileCrop({
    // file,
    src: 'https://cdn.leoao.com/act-head-img-528-2018-0a13wcg7zepe',
    imageRatio: '750:300', //
    onConfirm: function (data) {
      console.log(arguments)
      document.getElementById('img').setAttribute('src', data.base64)
    },
    onCancel: function () {
      console.log(arguments)
    }
  })
}
