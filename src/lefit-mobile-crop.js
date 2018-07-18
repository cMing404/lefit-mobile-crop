import utils from './utils'
const { setCss, convertBase64UrlToBlob } = utils
import styles from './styles'
import alloyfinger from './alloyfinger'

class ImbCrop {
  constructor(params) {
    let data = {
      file: null,
      src: '',
      onConfirm: function () { },
      onCancel: function () { },
      imageRatio: '1:1', // width:height
      widthRatio: '1:1', // 裁剪框的宽度 : 屏幕的宽度
      confirmText: '确定',
      cancelText: '取消',
      rotateText: '旋转'
    }
    this.init(Object.assign(data, params))
    this.initHtml()
    this.source && this.loadSource()
  }
  init(data) {
    this.onConfirm = data.onConfirm
    this.onCancel = data.onCancel
    this.source = data.file || data.src
    this.confirmText = data.confirmText
    this.cancelText = data.cancelText
    this.rotateText = data.rotateText
    this.imageRatio = data.imageRatio
    this.winWidth = window.innerWidth // 屏幕尺寸
    this.winHeight = window.innerHeight
    let widthRatio = data.widthRatio.split(':') 
    this.rectWidth = widthRatio[0] * this.winWidth / widthRatio[1]
    this.isTouch = false
    this.canvas = document.createElement('canvas')
    this.ctx = null
    this.drawWidth = 0
    this.drawHeight = 0
    this.scale = 1
    this.originX = 0
    this.originY = 0
    this.imgPos = {} // 保存图片绘制坐标信息
    this.clipWidth = 0 // 裁剪宽度
    this.clipHeight = 0 // 裁剪高度
    this.rectPos = {} // 保存裁剪区域信息
    this.container = null
    EXIF: window.EXIF,
    this.preventHandle = function (e) {
      e.preventDefault()
    }
    this.af = new alloyfinger(this.canvas, {
      pinch: this.pinch.bind(this),
      multipointEnd: this.multipointEnd.bind(this),
      pressMove: this.pressMove.bind(this)
    })
    this.imgHeight = 0 // canvas上绘制的img属性
    this.imgWidth = 0
    this.imgObj = null
  }
  initHtml() {
    let frag = document.createDocumentFragment()
    this.container = document.createElement('div')
    setCss(this.canvas, styles.canvas)
    setCss(this.container, styles.container)
    let btnContainer = document.createElement('div')
    let [confirmBtn, rotateBtn, cancelBtn] = [
      this.createBtn(this.confirmText),
      this.createBtn(this.rotateText),
      this.createBtn(this.cancelText)
    ]
    confirmBtn.addEventListener('click', this.confirm.bind(this), false)
    rotateBtn.addEventListener('click', this.rotate.bind(this), false)
    cancelBtn.addEventListener('click', this.cancel.bind(this), false)
    setCss(cancelBtn, styles.btn, {width: '15%'})
    setCss(rotateBtn, styles.btn, {width: '70%'})
    setCss(confirmBtn, styles.btn, {width: '15%'})
    setCss(btnContainer, styles.btnContainer)
    btnContainer.appendChild(cancelBtn)
    btnContainer.appendChild(rotateBtn)
    btnContainer.appendChild(confirmBtn)
    frag.appendChild(btnContainer)
    frag.appendChild(this.canvas)
    this.container.appendChild(frag)
    document.body.appendChild(this.container)
  }
  createBtn(name) {
    let btn = document.createElement('span')
    btn.innerHTML = name
    return btn
  }
  src2obj (src, crossOrigin) {
    return new Promise((resolve, reject) => {
      let img = new Image()
      if (crossOrigin) {
        img.crossOrigin = 'Anonymous'
      }
      img.src = src
      img.addEventListener('load', loadEvt)
      img.addEventListener('error', errorEvt)
      function loadEvt () {
        return resolve(img)
        removeEvt()
      }
      function errorEvt() {
        return reject()
        removeEvt()
      }
      function removeEvt () {
        img.removeEventListener('load', loadEvt)
        img.removeEventListener('error', errorEvt)
      }
    })
  }
  loadSource() {
    let me = this
    // 文件类型判断
    if (typeof this.source === 'string') {
      let needsCross = /(https?|ftp|file):\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]/.test(this.source)
      this.src2obj(this.source, needsCross).then(img => {
        this.imgLoadCallback(img)
      })
    } else {
      if (!/image\/[png|jpeg|jpg]/.test(this.source.type)) {
        alert('请上传文件类型为png/jpeg/jpg其中一种的图片!')
        return false
      }
      let reader = new FileReader()
      reader.readAsDataURL(this.source)
      reader.onload = (event) => {
        me.src2obj(event.target.result).then(img => {
          me.imgLoadCallback(img)
        })
      }
    }
  }
  // 图片加载后的统一回调
  imgLoadCallback (imgObj) {
    // 这里可能存在旋转的情况
    if (this.EXIF && this.getPhotoOrientation(imgObj)) {
      let rightImg = new Image()
      rightImg.src = this.getRightBase64(imgObj)
      rightImg.onload = function () {
        this.setRightImgInfo(imgObj)
      }
    } else {
      this.setRightImgInfo(imgObj)
    }
  }
  setRightImgInfo (imgObj) { // 获取到正确的图片后进行信息获取
    this.imgWidth = imgObj.width
    this.imgHeight = imgObj.height
    this.imgObj = imgObj
    let canvas = document.createElement('canvas')
    let ctx = canvas.getContext('2d')
    canvas.width = this.imgWidth
    canvas.height = this.imgHeight
    ctx.drawImage(imgObj, 0, 0, this.imgWidth, this.imgHeight)
    this.initCut()
  }
  initCut () {
    // 这里需要将body的touchmove事件屏蔽掉 否认安卓会滚 // 紧随
    this.container.style.display = 'block'
    document.body.addEventListener('touchmove', this.preventHandle, {passive: false})
    this.originX = this.winWidth / 2
    this.originY = this.winHeight / 2
    let ratio = this.imageRatio.split(':')
    // let limitHeight = ratio ? ratio[1] * this.winWidth / ratio[0] : this.winWidth // 根据设置的图片比例，算出的高度
    let limitHeight = ratio ? ratio[1] * this.rectWidth / ratio[0] : this.rectWidth // 根据设置的图片比例，算出的高度

    if (this.imgWidth < this.imgHeight) {
      this.drawWidth = this.winWidth
      this.scale = this.drawWidth / this.imgWidth
      this.drawHeight = this.scale * this.imgHeight
      if (this.drawHeight < limitHeight) { // 当缩放后的高度小于限制高度，高度设为限制高度，宽度等比自适应
        this.drawHeight = limitHeight
        this.drawWidth = this.imgWidth * limitHeight / this.imgHeight
        this.scale = this.drawWidth / this.imgWidth
      }
    } else {
      this.drawHeight = limitHeight
      this.scale = this.drawHeight / this.imgHeight
      this.drawWidth = this.scale * this.imgWidth
      if (this.drawWidth < this.winWidth) { // 当缩放后的宽度小于屏幕宽度，宽度设为屏幕宽度，高度等比自适应
        this.drawWidth = this.winWidth
        this.drawHeight = this.winWidth * this.imgHeight / this.imgWidth
        this.scale = this.drawHeight / this.imgHeight
      }
    }
    this.ctx = this.canvas.getContext('2d')
    this.canvas.width = this.winWidth
    this.canvas.height = this.winHeight
    this.drawImage()
    this.drawClipRect()
    this.drawMask()
  }
  drawImage () {
    // 根据origin和偏移量来实时调整
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.drawImage(this.imgObj, this.originX - this.drawWidth / 2, this.originY - this.drawHeight / 2, this.drawWidth, this.drawHeight)
    this.imgPos = {
      x1: this.originX - this.drawWidth / 2,
      y1: this.originY - this.drawHeight / 2
    }
    this.imgPos.x2 = this.imgPos.x1 + this.drawWidth
    this.imgPos.y2 = this.imgPos.y1 + this.drawHeight
  }
  drawClipRect () { // 绘制裁剪区域
    this.ctx.fillStyle = '#fff'
    this.ctx.strokeStyle = '#fff'
    let ratio = this.imageRatio.split(':')
    this.clipHeight = ratio ? ratio[1] * this.rectWidth / ratio[0] : this.rectWidth
    this.clipWidth = this.rectWidth
    let leftTopPosX = this.winWidth / 2 - this.clipWidth / 2
    let leftTopPosY = this.winHeight / 2 - this.clipHeight / 2
    // this.ctx.strokeRect(leftTopPosX, leftTopPosY, this.clipWidth, this.clipHeight)
    this.rectPos = {
      x1: leftTopPosX,
      y1: leftTopPosY
    }
    this.rectPos.x2 = leftTopPosX + this.clipWidth
    this.rectPos.y2 = leftTopPosY + this.clipHeight
  }
  drawMask () {
    this.ctx.fillStyle = 'rgba(0,0,0,.6)'
    this.ctx.fillRect(0, 0, Math.round(this.rectPos.x1), Math.round(this.canvas.height))
    this.ctx.fillRect(Math.round(this.rectPos.x1), 0, Math.round(this.rectPos.x2 - this.rectPos.x1), Math.round(this.rectPos.y1))
    this.ctx.fillRect(Math.round(this.rectPos.x2), 0, this.canvas.width, this.canvas.height)
    this.ctx.fillRect(Math.round(this.rectPos.x1), Math.round(this.rectPos.y2), Math.round(this.rectPos.x2 - this.rectPos.x1), Math.round(this.rectPos.y2 - this.rectPos.y1))
  }
  pinch(evt) {
    this.isTouch = true
    let scale = this.scale * (evt.zoom || 1)
    if (scale > this.maxScale) {
      return false
    }
    this.drawWidth = this.imgWidth * scale
    this.drawHeight = this.imgHeight * scale
    this.drawImage()
    this.drawClipRect()
    this.drawMask()
  }
  multipointEnd(evt) {
    this.isTouch = false
    this.scale = this.drawWidth / this.imgWidth
    if (!this.isBeyond()) {
      this.reset()
      return false
    }
  }
  pressMove(evt) {
    this.isTouch = true
    this.originX = this.originX + evt.deltaX
    this.originY = this.originY + evt.deltaY
    this.drawImage()
    this.drawClipRect()
    this.drawMask()
  }
  rotate() {
    let me = this
    let canvas = document.createElement('canvas')
    let ctx = canvas.getContext('2d')
    canvas.width = this.imgObj.height // 因为canvas重置宽高会刷新画板,所以预先手动转换宽高
    canvas.height = this.imgObj.width
    ctx.translate(this.imgObj.height, 0) // 将canvas的画布点转移到右上角
    ctx.rotate(90 * Math.PI / 180)
    ctx.drawImage(this.imgObj, 0, 0, this.imgObj.width, this.imgObj.height)
    this.src2obj(canvas.toDataURL()).then(img => {
      this.imgObj = img
      this.imgWidth = img.width
      this.imgHeight = img.height
      this.initCut()
    })
  }
  getPhotoOrientation (img) {
    let me = this
    this.EXIF.getData(img, function () {
      me.orient = me.EXIF.getTag(this, 'Orientation')
    })
    return me.orient !== 1 || me.orient !== undefined
  }
  isBeyond () {
    // 注: x1y1代表左上角 x2y2代表右下角坐标
    if (this.rectPos.x1 - this.imgPos.x1 >= 0 && this.rectPos.y1 - this.imgPos.y1 >= 0 && this.rectPos.x2 - this.imgPos.x2 <= 0 && this.rectPos.y2 - this.imgPos.y2 <= 0) {
      return true
    } else {
      return false
    }
  }
  reset (resetPos) {
    if (this.isTouch) {
      return false
    }
    // 注: x1y1代表左上角 x2y2代表右下角坐标
    let count = 0, rate = 1.5
    if (!resetPos) {
      resetPos = {
        x1: this.imgPos.x1,
        y1: this.imgPos.y1,
        x2: this.imgPos.x2,
        y2: this.imgPos.y2
      }
    }
    let disX1 = this.rectPos.x1 - this.imgPos.x1
    let disY1 = this.rectPos.y1 - this.imgPos.y1
    let disX2 = this.rectPos.x2 - this.imgPos.x2
    let disY2 = this.rectPos.y2 - this.imgPos.y2
    if (disX1 < 0 && disX2 > 0 || disY1 < 0 && disY2 > 0) {
      this.initCut()
      return false
    }
    if (disX1 < 0) {
      count++
      resetPos.x1 = this.rectPos.x1 - (Math.abs(disX1) < 1 ? 0 : disX1 / rate)
      resetPos.x2 = resetPos.x1 + this.imgWidth * this.scale
    }
    if (disY1 < 0) {
      count++
      resetPos.y1 = this.rectPos.y1 - (Math.abs(disY1) < 1 ? 0 : disY1 / rate)
      resetPos.y2 = resetPos.y1 + this.imgHeight * this.scale
    }
    if (disX2 > 0) {
      count++
      resetPos.x2 = this.rectPos.x2 - (Math.abs(disX2) < 1 ? 0 : disX2 / rate)
      resetPos.x1 = this.rectPos.x2 - this.imgWidth * this.scale
    }
    if (disY2 > 0) {
      count++
      resetPos.y2 = this.rectPos.y2 - (Math.abs(disY2) < 1 ? 0 : disY2 / rate)
      resetPos.y1 = this.rectPos.y2 - this.imgHeight * this.scale
    }
    if (count > 2) {
      this.initCut()
      return false
    }
    this.originX = resetPos.x1 + (resetPos.x2 - resetPos.x1) / 2
    this.originY = resetPos.y1 + (resetPos.y2 - resetPos.y1) / 2
    this.drawImage()
    this.drawMask()
    if (count > 0) {
      setTimeout(() => {
        this.reset(resetPos)
      }, 20)
    }
  }
  getClipPos () { // 获取最终裁剪坐标
    return {
      w: ~~(this.clipWidth / this.scale),
      h: ~~(this.clipHeight / this.scale),
      offsetX: ~~((this.rectPos.x1 - this.imgPos.x1) / this.scale),
      offsetY: ~~((this.rectPos.y1 - this.imgPos.y1) / this.scale)
    }
  }
  confirm() {
    let clipPos = this.getClipPos()
    let originCanvas = document.createElement('canvas')
    let originCanvasCtx = originCanvas.getContext('2d')
    originCanvas.width = clipPos.w
    originCanvas.height = clipPos.h
    originCanvasCtx.drawImage(this.imgObj, -clipPos.offsetX, -clipPos.offsetY, this.imgObj.width, this.imgObj.height)
    let base64 = originCanvas.toDataURL()
    this.onConfirm && this.onConfirm({
      base64: base64,
      file: convertBase64UrlToBlob(base64),
      clip: clipPos
    })
    document.body.removeEventListener('touchmove', this.preventHandle)
    this.container.style.display = 'none'
    this.container.parentNode.removeChild(this.container)
  }
  cancel() {
    document.body.removeEventListener('touchmove', this.preventHandle)
    this.imgObj = null
    this.container.style.display = 'none'
    this.container.parentNode.removeChild(this.container)
    this.onCancel && this.onCancel()
  }
}

export default ImbCrop
