import { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import NProgress from 'nprogress';

import { MODEL, fetchProfiles, fetchProfile, createProfile, updateProfile } from 'modules/crud/profile';
import { clearActionStatus } from 'modules/crud/actions';
import { select, selectActionStatus } from 'modules/crud/selectors';
import * as Notification from 'modules/notification/actions';

import { Profile } from 'components';

import traverse from 'traverse';

const formData = {
  "security": {
    k: "465B5CE8 B199B49F AA5F0A2E E238A6BC",
    op: "5F1D289C 5D354D0A 140C2548 F5F3E3BA",
    amf: "8000"
  },
  "ambr": {
    "downlink": 1024000,
    "uplink": 1024000
  },
  "pdn": [
    {
      "apn": "internet",
      "qos": {
        "qci": 9,
        "arp": {
          "priority_level": 8,
          "pre_emption_capability": 1,
          "pre_emption_vulnerability": 1
        }
      },
    }
  ]
}

class Document extends Component {
  static propTypes = {
    action: PropTypes.string,
    visible: PropTypes.bool, 
    onHide: PropTypes.func
  }

  state = {
    formData
  }

  componentWillMount() {
    const { profile, dispatch } = this.props

    if (profile.needsFetch) {
      dispatch(profile.fetch)
    }
  }

  componentWillReceiveProps(nextProps) {
    const { profile, status } = nextProps
    const { dispatch, action, onHide } = this.props

    if (profile.needsFetch) {
      dispatch(profile.fetch)
    }

    if (profile.data) {
      // Mongoose library has a problem for 64bit-long type
      //
      //   FETCH : the library returns 'Number' type for 64bit-long type
      //   CREATE/UPDATE : the library returns 'String' type for 64bit-long type
      //
      // In this case, I cannot avoid json-schema validation function
      // So, I've changed the type from 'String' to 'Number' if the key name is 'downlink' and 'uplink'
      // 
      //    The followings are changed from 'String' to 'Number' after DB CREATE or UPDATE
      //     - ambr.downlink, ambr.uplink, qos.mbr.downlink, qos.mbr.uplink, qos.gbr.downlink, qos.gbr.uplink
      // 
      traverse(profile.data).forEach(function(x) {
        if (this.key == 'downlink') this.update(Number(x));
        if (this.key == 'uplink') this.update(Number(x));
      })
      this.setState({ formData: profile.data })
    } else {
      this.setState({ formData });
    }

    if (status.response) {
      NProgress.configure({ 
        parent: 'body',
        trickleSpeed: 5
      });
      NProgress.done(true);

      const message = action === 'create' ? "New profile created" : `${status.id} profile updated`;

      dispatch(Notification.success({
        title: 'Profile',
        message
      }));

      dispatch(clearActionStatus(MODEL, action));
      onHide();
    } 

    if (status.error) {
      NProgress.configure({ 
        parent: 'body',
        trickleSpeed: 5
      });
      NProgress.done(true);

      const response = ((status || {}).error || {}).response || {};

      let title = 'Unknown Code';
      let message = 'Unknown Error';
      if (response.data && response.data.name && response.data.message) {
        title = response.data.name;
        message = response.data.message;
      } else {
        title = response.status;
        message = response.statusText;
      }

      dispatch(Notification.error({
        title,
        message,
        autoDismiss: 0,
        action: {
          label: 'Dismiss',
          callback: () => onHide()
        }
      }));
      dispatch(clearActionStatus(MODEL, action));
    }
  }

  validate = (formData, errors) => {
    const { profiles, action, status } = this.props;
    const { imsi } = formData;

    if (action === 'create' && profiles && profiles.data &&
      profiles.data.filter(profile => profile.imsi === imsi).length > 0) {
      errors.imsi.addError(`'${imsi}' is duplicated`);
    }

    if (formData.pdn) {
      let apns = formData.pdn.map(pdn => { return pdn.apn } )
      let duplicates = {};
      for (let i = 0; i < apns.length; i++) {
        if (duplicates.hasOwnProperty(apns[i])) {
          duplicates[apns[i]].push(i);
        } else if (apns.lastIndexOf(apns[i]) !== i) {
          duplicates[apns[i]] = [i];
        }
      }

      for (let key in duplicates) {
        duplicates[key].forEach(index => 
          errors.pdn[index].apn.addError(`'${key}' is duplicated`));
      }
    }

    return errors;
  }

  handleSubmit = (formData) => {
    const { dispatch, action } = this.props;

    NProgress.configure({ 
      parent: '#nprogress-base-form',
      trickleSpeed: 5
    });
    NProgress.start();

    if (action === 'create') {
      dispatch(createProfile({}, formData));
    } else if (action === 'update') {
      dispatch(updateProfile(formData._id, {}, formData));
    } else {
      throw new Error(`Action type '${action}' is invalid.`);
    }
  }

  handleError = errors => {
    const { dispatch } = this.props;
    errors.map(error =>
      dispatch(Notification.error({
        title: 'Validation Error',
        message: error.stack
      }))
    )
  }

  render() {
    const {
      validate,
      handleChange,
      handleSubmit,
      handleError
    } = this;

    const { 
      visible,
      action,
      status,
      profile,
      onHide
    } = this.props

    return (
      <Profile.Edit
        visible={visible} 
        action={action}
        formData={this.state.formData}
        isLoading={profile.isLoading && !status.pending}
        validate={validate}
        onHide={onHide}
        onSubmit={handleSubmit}
        onError={handleError} />
    )
  }
}

Document = connect(
  (state, props) => ({ 
    profiles: select(fetchProfiles(), state.crud),
    profile: select(fetchProfile(props._id), state.crud),
    status: selectActionStatus(MODEL, state.crud, props.action)
  })
)(Document);

export default Document;
