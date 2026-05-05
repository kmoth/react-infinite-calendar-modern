import React, {Component} from 'react';

const getDisplayName = WrappedComponent =>
  WrappedComponent.displayName || WrappedComponent.name || 'Component';

export const compose = (...hocs) => BaseComponent =>
  hocs.reduceRight((EnhancedComponent, hoc) => hoc(EnhancedComponent), BaseComponent);

export const defaultProps = defaults => WrappedComponent => {
  const WithDefaultProps = props => <WrappedComponent {...defaults} {...props} />;
  WithDefaultProps.displayName = `defaultProps(${getDisplayName(WrappedComponent)})`;
  return WithDefaultProps;
};

export const withProps = createProps => WrappedComponent => {
  const WithProps = props => (
    <WrappedComponent
      {...props}
      {...(typeof createProps === 'function' ? createProps(props) : createProps)}
    />
  );
  WithProps.displayName = `withProps(${getDisplayName(WrappedComponent)})`;
  return WithProps;
};

export const withHandlers = handlers => WrappedComponent => {
  const WithHandlers = props => {
    const resolvedHandlers = Object.keys(handlers).reduce((acc, key) => {
      acc[key] = (...args) => handlers[key](props)(...args);
      return acc;
    }, {});

    return <WrappedComponent {...props} {...resolvedHandlers} />;
  };
  WithHandlers.displayName = `withHandlers(${getDisplayName(WrappedComponent)})`;
  return WithHandlers;
};

export const withState = (stateName, updaterName, initialValue) => WrappedComponent => {
  class WithState extends Component {
    static displayName = `withState(${getDisplayName(WrappedComponent)})`;

    state = {
      value: typeof initialValue === 'function'
        ? initialValue(this.props)
        : initialValue,
    };

    updateValue = (nextValue, callback) => {
      this.setState(
        ({value}) => ({
          value: typeof nextValue === 'function'
            ? nextValue(value)
            : nextValue,
        }),
        callback,
      );
    };

    render() {
      return (
        <WrappedComponent
          {...this.props}
          {...{
            [stateName]: this.state.value,
            [updaterName]: this.updateValue,
          }}
        />
      );
    }
  }

  return WithState;
};

export const withPropsOnChange = (shouldMapOrKeys, createProps) => WrappedComponent => {
  class WithPropsOnChange extends Component {
    static displayName = `withPropsOnChange(${getDisplayName(WrappedComponent)})`;

    computedProps = createProps(this.props);

    shouldRecompute(nextProps) {
      if (typeof shouldMapOrKeys === 'function') {
        return shouldMapOrKeys(this.props, nextProps);
      }

      return shouldMapOrKeys.some(key => this.props[key] !== nextProps[key]);
    }

    UNSAFE_componentWillReceiveProps(nextProps) {
      if (this.shouldRecompute(nextProps)) {
        this.computedProps = createProps(nextProps);
      }
    }

    render() {
      return <WrappedComponent {...this.props} {...this.computedProps} />;
    }
  }

  return WithPropsOnChange;
};
