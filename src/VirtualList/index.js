import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';

const ALIGNMENT = {
  AUTO: 'auto',
  CENTER: 'center',
  END: 'end',
  START: 'start',
};

const STYLE_WRAPPER = {
  overflow: 'auto',
  willChange: 'transform',
  WebkitOverflowScrolling: 'touch',
};

const STYLE_INNER = {
  position: 'relative',
  width: '100%',
  minHeight: '100%',
};

const STYLE_ITEM = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
};

class SizeAndPositionManager {
  constructor({itemCount, itemSizeGetter, estimatedItemSize}) {
    this.itemCount = itemCount;
    this.itemSizeGetter = itemSizeGetter;
    this.estimatedItemSize = estimatedItemSize;
    this.itemSizeAndPositionData = {};
    this.lastMeasuredIndex = -1;
  }

  updateConfig({itemCount, itemSizeGetter, estimatedItemSize}) {
    if (itemCount != null) this.itemCount = itemCount;
    if (itemSizeGetter != null) this.itemSizeGetter = itemSizeGetter;
    if (estimatedItemSize != null) this.estimatedItemSize = estimatedItemSize;
  }

  getSizeAndPositionForIndex(index) {
    if (index < 0 || index >= this.itemCount) {
      throw Error(`Requested index ${index} is outside of range 0..${this.itemCount}`);
    }

    if (index > this.lastMeasuredIndex) {
      const lastMeasured = this.getSizeAndPositionOfLastMeasuredItem();
      let offset = lastMeasured.offset + lastMeasured.size;

      for (let i = this.lastMeasuredIndex + 1; i <= index; i++) {
        const size = this.itemSizeGetter(i);
        if (size == null || isNaN(size)) {
          throw Error(`Invalid size returned for index ${i} of value ${size}`);
        }

        this.itemSizeAndPositionData[i] = {offset, size};
        offset += size;
      }

      this.lastMeasuredIndex = index;
    }

    return this.itemSizeAndPositionData[index];
  }

  getSizeAndPositionOfLastMeasuredItem() {
    return this.lastMeasuredIndex >= 0
      ? this.itemSizeAndPositionData[this.lastMeasuredIndex]
      : {offset: 0, size: 0};
  }

  getTotalSize() {
    const lastMeasured = this.getSizeAndPositionOfLastMeasuredItem();
    return lastMeasured.offset + lastMeasured.size + (this.itemCount - this.lastMeasuredIndex - 1) * this.estimatedItemSize;
  }

  getUpdatedOffsetForIndex({align = ALIGNMENT.START, containerSize, currentOffset, targetIndex}) {
    if (containerSize <= 0) return 0;

    const datum = this.getSizeAndPositionForIndex(targetIndex);
    const maxOffset = datum.offset;
    const minOffset = maxOffset - containerSize + datum.size;
    let idealOffset;

    switch (align) {
      case ALIGNMENT.END:
        idealOffset = minOffset;
        break;
      case ALIGNMENT.CENTER:
        idealOffset = maxOffset - (containerSize - datum.size) / 2;
        break;
      case ALIGNMENT.START:
        idealOffset = maxOffset;
        break;
      default:
        idealOffset = Math.max(minOffset, Math.min(maxOffset, currentOffset));
    }

    return Math.max(0, Math.min(this.getTotalSize() - containerSize, idealOffset));
  }

  getVisibleRange({containerSize, offset, overscanCount}) {
    const totalSize = this.getTotalSize();
    if (totalSize === 0) return {};

    const maxOffset = offset + containerSize;
    let start = this.findNearestItem(offset);
    let datum = this.getSizeAndPositionForIndex(start);
    let itemOffset = datum.offset + datum.size;
    let stop = start;

    while (itemOffset < maxOffset && stop < this.itemCount - 1) {
      stop++;
      itemOffset += this.getSizeAndPositionForIndex(stop).size;
    }

    start = Math.max(0, start - overscanCount);
    stop = Math.min(stop + overscanCount, this.itemCount - 1);

    return {start, stop};
  }

  resetItem(index) {
    this.lastMeasuredIndex = Math.min(this.lastMeasuredIndex, index - 1);
  }

  findNearestItem(offset) {
    offset = Math.max(0, offset);
    const lastMeasured = this.getSizeAndPositionOfLastMeasuredItem();
    const lastMeasuredIndex = Math.max(0, this.lastMeasuredIndex);

    if (lastMeasured.offset >= offset) {
      return this.binarySearch({high: lastMeasuredIndex, low: 0, offset});
    }

    return this.exponentialSearch({index: lastMeasuredIndex, offset});
  }

  binarySearch({low, high, offset}) {
    while (low <= high) {
      const middle = low + Math.floor((high - low) / 2);
      const currentOffset = this.getSizeAndPositionForIndex(middle).offset;

      if (currentOffset === offset) return middle;
      if (currentOffset < offset) low = middle + 1;
      else high = middle - 1;
    }

    return low > 0 ? low - 1 : 0;
  }

  exponentialSearch({index, offset}) {
    let interval = 1;
    while (index < this.itemCount && this.getSizeAndPositionForIndex(index).offset < offset) {
      index += interval;
      interval *= 2;
    }

    return this.binarySearch({
      high: Math.min(index, this.itemCount - 1),
      low: Math.floor(index / 2),
      offset,
    });
  }
}

export default class VirtualList extends PureComponent {
  static defaultProps = {
    overscanCount: 3,
    width: '100%',
  };

  static propTypes = {
    className: PropTypes.string,
    estimatedItemSize: PropTypes.number,
    height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    itemCount: PropTypes.number.isRequired,
    itemSize: PropTypes.oneOfType([PropTypes.number, PropTypes.array, PropTypes.func]).isRequired,
    onItemsRendered: PropTypes.func,
    onScroll: PropTypes.func,
    overscanCount: PropTypes.number,
    renderItem: PropTypes.func.isRequired,
    scrollOffset: PropTypes.number,
    scrollToAlignment: PropTypes.oneOf(Object.values(ALIGNMENT)),
    scrollToIndex: PropTypes.number,
    style: PropTypes.object,
    width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  };

  constructor(props) {
    super(props);

    this.sizeAndPositionManager = new SizeAndPositionManager({
      itemCount: props.itemCount,
      itemSizeGetter: this.itemSizeGetter(props.itemSize),
      estimatedItemSize: this.getEstimatedItemSize(props),
    });

    this.state = {
      offset: props.scrollOffset || (props.scrollToIndex != null && this.getOffsetForIndex(props.scrollToIndex)) || 0,
    };

    this.styleCache = {};
  }

  getRef = node => {
    this.rootNode = node;
  };

  componentDidMount() {
    this.rootNode.addEventListener('scroll', this.handleScroll, {passive: true});
    this.scrollTo(this.state.offset);
  }

  componentDidUpdate(prevProps, prevState) {
    const itemPropsChanged =
      prevProps.itemCount !== this.props.itemCount ||
      prevProps.itemSize !== this.props.itemSize ||
      prevProps.estimatedItemSize !== this.props.estimatedItemSize;

    if (itemPropsChanged) {
      this.sizeAndPositionManager.updateConfig({
        itemCount: this.props.itemCount,
        itemSizeGetter: this.itemSizeGetter(this.props.itemSize),
        estimatedItemSize: this.getEstimatedItemSize(),
      });
      this.recomputeSizes();
    }

    if (this.props.scrollOffset !== prevProps.scrollOffset) {
      this.setOffset(this.props.scrollOffset || 0);
    } else if (
      typeof this.props.scrollToIndex === 'number' &&
      (this.props.scrollToIndex !== prevProps.scrollToIndex ||
        this.props.scrollToAlignment !== prevProps.scrollToAlignment ||
        itemPropsChanged)
    ) {
      this.setOffset(this.getOffsetForIndex(this.props.scrollToIndex));
    }

    if (prevState.offset !== this.state.offset) {
      this.scrollTo(this.state.offset);
    }
  }

  componentWillUnmount() {
    this.rootNode.removeEventListener('scroll', this.handleScroll);
  }

  setOffset(offset) {
    if (offset !== this.state.offset) this.setState({offset});
  }

  itemSizeGetter = itemSize => index => this.getSize(index, itemSize);

  handleScroll = event => {
    const offset = this.rootNode.scrollTop;
    if (offset < 0 || this.state.offset === offset || event.target !== this.rootNode) return;

    this.setState({offset});
    if (typeof this.props.onScroll === 'function') {
      this.props.onScroll(offset, event);
    }
  };

  scrollTo(value) {
    if (this.rootNode) this.rootNode.scrollTop = value;
  }

  getOffsetForIndex(index, scrollToAlignment = this.props.scrollToAlignment, itemCount = this.props.itemCount) {
    if (index < 0 || index >= itemCount) index = 0;
    return this.sizeAndPositionManager.getUpdatedOffsetForIndex({
      align: scrollToAlignment,
      containerSize: this.props.height,
      currentOffset: this.state?.offset || 0,
      targetIndex: index,
    });
  }

  recomputeSizes(startIndex = 0) {
    this.styleCache = {};
    this.sizeAndPositionManager.resetItem(startIndex);
  }

  getEstimatedItemSize(props = this.props) {
    return props.estimatedItemSize || (typeof props.itemSize === 'number' && props.itemSize) || 50;
  }

  getSize(index, itemSize) {
    if (typeof itemSize === 'function') return itemSize(index);
    return Array.isArray(itemSize) ? itemSize[index] : itemSize;
  }

  getStyle(index) {
    if (this.styleCache[index]) return this.styleCache[index];

    const {size, offset} = this.sizeAndPositionManager.getSizeAndPositionForIndex(index);
    this.styleCache[index] = {
      ...STYLE_ITEM,
      height: size,
      top: offset,
    };

    return this.styleCache[index];
  }

  render() {
    const {
      className,
      height,
      itemCount,
      onItemsRendered,
      overscanCount,
      renderItem,
      style,
      width,
    } = this.props;
    const {offset} = this.state;
    const {start, stop} = this.sizeAndPositionManager.getVisibleRange({
      containerSize: height || 0,
      offset,
      overscanCount,
    });
    const items = [];

    if (typeof start !== 'undefined' && typeof stop !== 'undefined') {
      for (let index = start; index <= stop; index++) {
        items.push(renderItem({index, style: this.getStyle(index)}));
      }

      if (typeof onItemsRendered === 'function') {
        onItemsRendered({startIndex: start, stopIndex: stop});
      }
    }

    return (
      <div
        className={className}
        ref={this.getRef}
        style={{...STYLE_WRAPPER, ...style, height, width}}
      >
        <div style={{...STYLE_INNER, height: this.sizeAndPositionManager.getTotalSize()}}>
          {items}
        </div>
      </div>
    );
  }
}
